from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import database
from backend.core.config import OPENROUTER_RECIPE_MODEL
from backend.database import (
    add_manual_shopping_item,
    add_shopping_items_to_inventory,
    get_profile,
    init_db,
    list_shopping_list_items,
    record_feedback_event,
    update_body_profile,
    update_preferences,
    upsert_inventory_items,
)
from backend.main import app
from backend.routers import inventory as inventory_router
from backend.routers.recipe import complete_recipe
from backend.schemas.feedback import RecipeCompletionRequest
from backend.schemas.recommend import RecommendRequest
from backend.schemas.recipe import RecipeHit
from backend.services import orchestrator
from backend.services.ingredient_service import (
    ImageRecognitionError,
    build_inventory_candidate,
    enrich_candidates_with_categories,
    parse_freeform_inventory_text,
)
from backend.services.knowledge_service import get_knowledge_service
from backend.services.orchestrator import recommend, recommend_weekly
from backend.services.video_reference_service import VideoReferenceService


class LightTableMVPTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        database.SQLITE_DB_PATH = Path(self.temp_dir.name) / "test_lighttable.db"
        init_db()
        orchestrator.llm_is_configured = lambda: False

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_fuzzy_input_merges_synonyms(self) -> None:
        items = parse_freeform_inventory_text("圣女果和小番茄，半盒豆腐")
        self.assertEqual(len(items), 2)
        cherry_tomato = next(item for item in items if item["normalized_name"] == "tomato_cherry")
        self.assertEqual(cherry_tomato["quantity_text"], "2份")

    def test_special_constraints_filter_recipes(self) -> None:
        update_preferences("default", health_constraints=["gluten_free"])
        upsert_inventory_items(
            "default",
            [
                build_inventory_candidate("燕麦", quantity_text="1杯"),
                build_inventory_candidate("酸奶", quantity_text="1杯"),
                build_inventory_candidate("圣女果", quantity_text="1盒"),
                build_inventory_candidate("鸡胸肉", quantity_text="200g"),
                build_inventory_candidate("青椒", quantity_text="2个"),
            ],
        )

        result = asyncio.run(recommend(RecommendRequest(user_id="default", tags=["快手菜"])))
        recipe_ids = [plan.dishes[0].recipe_id for plan in result.plans]
        self.assertIn("r_002", recipe_ids)
        self.assertNotIn("r_009", recipe_ids)

    def test_explicit_preferences_are_included_in_preference_weights(self) -> None:
        update_preferences(
            "default",
            flavor_tags=["高蛋白"],
            method_tags=["凉拌"],
            cuisine_tags=["家常"],
            cooking_level="chef",
        )

        captured: dict[str, object] = {}

        class StubKnowledgeService:
            recipes = []

            def list_candidate_hits(self, **kwargs):
                captured.update(kwargs)
                return []

        with patch("backend.services.orchestrator.get_knowledge_service", return_value=StubKnowledgeService()):
            asyncio.run(recommend(RecommendRequest(user_id="default", tags=[])))

        weights = captured["preference_weights"]
        self.assertGreater(weights["凉拌"], 0)
        self.assertGreater(weights["高蛋白"], 0)
        self.assertGreater(weights["high_protein"], 0)
        self.assertGreater(weights["家常"], 0)
        self.assertGreater(weights["C"], 0)

    def test_uncommon_compound_ingredient_is_not_split_by_single_char_alias(self) -> None:
        items = parse_freeform_inventory_text("一斤皮皮虾")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["display_name"], "皮皮虾")
        self.assertEqual(items[0]["normalized_name"], "皮皮虾")
        self.assertEqual(items[0]["quantity_text"], "一斤")

    def test_consecutive_quantities_bind_to_the_correct_item(self) -> None:
        items = parse_freeform_inventory_text(
            "买了12个鸡蛋一盒酸奶一个芒果四个西红柿一斤五花肉5个青椒还有一盒豆腐一盒圣女果一个卷心菜"
        )
        parsed = {item["display_name"]: item["quantity_text"] for item in items}
        self.assertEqual(parsed["鸡蛋"], "12个")
        self.assertEqual(parsed["酸奶"], "一盒")
        self.assertEqual(parsed["芒果"], "一个")
        self.assertEqual(parsed["番茄"], "四个")
        self.assertEqual(parsed["五花肉"], "一斤")
        self.assertEqual(parsed["青椒"], "5个")
        self.assertEqual(parsed["豆腐"], "一盒")
        self.assertEqual(parsed["圣女果"], "一盒")
        self.assertEqual(parsed["卷心菜"], "一个")

    def test_hami_melon_defaults_to_fruit_category(self) -> None:
        item = build_inventory_candidate("哈密瓜", quantity_text="1个")
        self.assertEqual(item["category"], "fruit_snacks")

    def test_llm_can_reclassify_unknown_ingredient(self) -> None:
        candidates = [build_inventory_candidate("佛手瓜", quantity_text="1个")]
        self.assertEqual(candidates[0]["category"], "dry_goods")

        async def fake_chat(messages, model=None):
            del messages, model
            return '[{"name":"佛手瓜","category":"vegetables_tofu"}]'

        with patch("backend.services.ingredient_service.llm_is_configured", return_value=True):
            with patch("backend.services.ingredient_service.chat", side_effect=fake_chat):
                enriched = asyncio.run(enrich_candidates_with_categories(candidates))

        self.assertEqual(enriched[0]["category"], "vegetables_tofu")

    def test_recommendation_generates_abc_plans(self) -> None:
        upsert_inventory_items(
            "default",
            [
                build_inventory_candidate("番茄", quantity_text="3个"),
                build_inventory_candidate("豆腐", quantity_text="1盒"),
                build_inventory_candidate("鸡蛋", quantity_text="4个"),
                build_inventory_candidate("鸡胸肉", quantity_text="200g"),
                build_inventory_candidate("青椒", quantity_text="2个"),
                build_inventory_candidate("西兰花", quantity_text="1朵"),
                build_inventory_candidate("虾仁", quantity_text="200g"),
                build_inventory_candidate("三文鱼", quantity_text="1块"),
            ],
        )

        result = asyncio.run(recommend(RecommendRequest(user_id="default", tags=["消耗临期"])))
        labels = {plan.plan_id for plan in result.plans}
        self.assertTrue({"A", "B", "C"}.issubset(labels))

    def test_feedback_bias_changes_a_plan_choice(self) -> None:
        upsert_inventory_items(
            "default",
            [
                build_inventory_candidate("番茄", quantity_text="2个"),
                build_inventory_candidate("豆腐", quantity_text="1盒"),
                build_inventory_candidate("鸡蛋", quantity_text="4个"),
                build_inventory_candidate("鸡胸肉", quantity_text="200g"),
                build_inventory_candidate("青椒", quantity_text="2个"),
            ],
        )
        record_feedback_event(
            "default",
            signal="complete",
            recipe_id="r_002",
            payload={"tags": ["高蛋白"], "difficulty": "A"},
        )
        result = asyncio.run(recommend(RecommendRequest(user_id="default", tags=[])))
        a_plan = next(plan for plan in result.plans if plan.plan_id == "A")
        self.assertEqual(a_plan.dishes[0].recipe_id, "r_002")

    def test_expiring_pork_belly_surfaces_spicy_pork_recipe(self) -> None:
        upsert_inventory_items(
            "default",
            [
                build_inventory_candidate("五花肉", quantity_text="1斤"),
            ],
        )

        result = asyncio.run(recommend(RecommendRequest(user_id="default", tags=["消耗临期"])))
        recipe_ids = [plan.dishes[0].recipe_id for plan in result.plans]
        self.assertIn("r_012", recipe_ids)

    def test_llm_blueprint_can_override_rule_selected_plan(self) -> None:
        class StubKnowledgeService:
            recipes = [
                {
                    "id": "r_002",
                    "core_ingredients": ["鸡胸肉", "青椒", "酱油"],
                    "optional_ingredients": [],
                    "nutrition_tags": ["high_protein"],
                    "constraint_tags": [],
                },
                {
                    "id": "r_011",
                    "core_ingredients": ["生菜", "蚝油"],
                    "optional_ingredients": ["蒜"],
                    "nutrition_tags": ["low_sugar"],
                    "constraint_tags": [],
                },
                {
                    "id": "r_004",
                    "core_ingredients": ["豆腐", "香菇"],
                    "optional_ingredients": ["酱油"],
                    "nutrition_tags": ["low_sugar"],
                    "constraint_tags": ["vegetarian"],
                },
                {
                    "id": "r_005",
                    "core_ingredients": ["牛肉", "番茄"],
                    "optional_ingredients": [],
                    "nutrition_tags": ["high_protein"],
                    "constraint_tags": [],
                },
            ]

            def list_candidate_hits(self, **kwargs):
                del kwargs
                return [
                    RecipeHit(
                        recipe_id="r_002",
                        title="青椒鸡胸肉快炒",
                        tags=["家常", "炒", "高蛋白"],
                        difficulty="A",
                        time_minutes=18,
                        matched_ingredients=["鸡胸肉", "青椒"],
                        missing_ingredients=["酱油"],
                        fit_tags=["快手"],
                        score=9.5,
                    ),
                    RecipeHit(
                        recipe_id="r_011",
                        title="蚝油生菜",
                        tags=["快手", "家常", "炒"],
                        difficulty="A",
                        time_minutes=8,
                        matched_ingredients=["生菜", "蚝油"],
                        missing_ingredients=[],
                        fit_tags=["快手", "优先消耗库存"],
                        score=8.0,
                    ),
                    RecipeHit(
                        recipe_id="r_004",
                        title="香菇豆腐煲",
                        tags=["家常", "煲", "素菜"],
                        difficulty="B",
                        time_minutes=25,
                        matched_ingredients=["豆腐"],
                        missing_ingredients=["酱油"],
                        fit_tags=["家常"],
                        score=7.2,
                    ),
                    RecipeHit(
                        recipe_id="r_005",
                        title="番茄牛肉炖菜",
                        tags=["炖", "进阶", "高蛋白"],
                        difficulty="C",
                        time_minutes=40,
                        matched_ingredients=["番茄", "牛肉"],
                        missing_ingredients=[],
                        fit_tags=["高蛋白"],
                        score=6.8,
                    ),
                ]

        async def fake_reason(**kwargs):
            return f"{kwargs['plan_label']} reason"

        llm_outputs = [
            json.dumps(
                {
                    "strategy_summary": "优先按用户偏好重排候选，再给出 A/B/C 组合。",
                    "plans": [
                        {"plan_id": "A", "recipe_id": "r_011", "reason": "更贴近当前清爽偏好", "fit_tags": ["快手", "清爽"]},
                        {"plan_id": "B", "recipe_id": "r_004", "reason": "标准难度更稳妥", "fit_tags": ["家常"]},
                        {"plan_id": "C", "recipe_id": "r_005", "reason": "进阶档满足高蛋白", "fit_tags": ["高蛋白"]},
                    ],
                },
                ensure_ascii=False,
            )
        ]

        async def fake_chat(messages, model=None):
            del messages, model
            return llm_outputs.pop(0)

        with patch("backend.services.orchestrator.get_knowledge_service", return_value=StubKnowledgeService()):
            with patch("backend.services.orchestrator.llm_is_configured", return_value=True):
                with patch("backend.services.orchestrator.chat", side_effect=fake_chat):
                    with patch("backend.services.orchestrator._render_reason", side_effect=fake_reason):
                        result = asyncio.run(recommend(RecommendRequest(user_id="default", tags=["快手菜"])))

        a_plan = next(plan for plan in result.plans if plan.plan_id == "A")
        self.assertEqual(a_plan.dishes[0].recipe_id, "r_011")
        self.assertEqual(result.strategy_summary, "优先按用户偏好重排候选，再给出 A/B/C 组合。")

    def test_llm_planner_receives_inventory_and_constraints(self) -> None:
        update_preferences("default", health_constraints=["gluten_free"], method_tags=["炒"])
        upsert_inventory_items(
            "default",
            [
                build_inventory_candidate("鸡胸肉", quantity_text="200g"),
                build_inventory_candidate("青椒", quantity_text="2个"),
            ],
        )

        captured_messages: list[dict] = []
        captured_models: list[str | None] = []

        class StubKnowledgeService:
            recipes = [
                {
                    "id": "r_002",
                    "core_ingredients": ["鸡胸肉", "青椒", "酱油"],
                    "optional_ingredients": [],
                    "nutrition_tags": ["high_protein", "gluten_free"],
                    "constraint_tags": ["gluten_free"],
                },
                {
                    "id": "r_004",
                    "core_ingredients": ["豆腐", "香菇"],
                    "optional_ingredients": [],
                    "nutrition_tags": ["low_sugar"],
                    "constraint_tags": ["vegetarian"],
                },
                {
                    "id": "r_005",
                    "core_ingredients": ["牛肉", "番茄"],
                    "optional_ingredients": [],
                    "nutrition_tags": ["high_protein"],
                    "constraint_tags": [],
                },
            ]

            def list_candidate_hits(self, **kwargs):
                del kwargs
                return [
                    RecipeHit(
                        recipe_id="r_002",
                        title="青椒鸡胸肉快炒",
                        tags=["家常", "炒", "高蛋白"],
                        difficulty="A",
                        time_minutes=18,
                        matched_ingredients=["鸡胸肉", "青椒"],
                        missing_ingredients=["酱油"],
                        fit_tags=["快手"],
                        score=9.5,
                    ),
                    RecipeHit(
                        recipe_id="r_004",
                        title="香菇豆腐煲",
                        tags=["家常", "煲", "素菜"],
                        difficulty="B",
                        time_minutes=25,
                        matched_ingredients=[],
                        missing_ingredients=["豆腐"],
                        fit_tags=[],
                        score=6.0,
                    ),
                    RecipeHit(
                        recipe_id="r_005",
                        title="番茄牛肉炖菜",
                        tags=["炖", "进阶"],
                        difficulty="C",
                        time_minutes=40,
                        matched_ingredients=[],
                        missing_ingredients=["牛肉"],
                        fit_tags=[],
                        score=5.0,
                    ),
                ]

        async def fake_chat(messages, model=None):
            captured_models.append(model)
            captured_messages.extend(messages)
            return json.dumps(
                {
                    "strategy_summary": "已结合库存和约束进行 LLM 规划。",
                    "plans": [
                        {"plan_id": "A", "recipe_id": "r_002", "reason": "优先消耗现有鸡胸肉和青椒", "fit_tags": ["快手", "高蛋白"]},
                        {"plan_id": "B", "recipe_id": "r_004", "reason": "提供一档更稳的家常方案", "fit_tags": ["家常"]},
                        {"plan_id": "C", "recipe_id": "r_005", "reason": "进阶方案补足高蛋白", "fit_tags": ["高蛋白"]},
                    ],
                },
                ensure_ascii=False,
            )

        with patch("backend.services.orchestrator.get_knowledge_service", return_value=StubKnowledgeService()):
            with patch("backend.services.orchestrator.llm_is_configured", return_value=True):
                with patch("backend.services.orchestrator.chat", side_effect=fake_chat):
                    result = asyncio.run(recommend(RecommendRequest(user_id="default", tags=["快手菜"])))

        planner_prompt = captured_messages[-1]["content"]
        self.assertIn("特殊约束：gluten_free", planner_prompt)
        self.assertIn("鸡胸肉", planner_prompt)
        self.assertIn("青椒", planner_prompt)
        self.assertIn(OPENROUTER_RECIPE_MODEL, captured_models)
        self.assertEqual(result.plans[0].dishes[0].recipe_id, "r_002")

    def test_llm_generated_recipe_can_open_detail_page(self) -> None:
        upsert_inventory_items(
            "default",
            [
                build_inventory_candidate("五花肉", quantity_text="1斤"),
                build_inventory_candidate("青椒", quantity_text="2个"),
            ],
        )
        client = TestClient(app)

        async def fake_chat(messages, model=None):
            del messages, model
            return json.dumps(
                {
                    "strategy_summary": "优先消耗临期五花肉，直接生成更贴近当前库存的家常菜。",
                    "plans": [
                        {
                            "plan_id": "A",
                            "title": "辣椒炒肉",
                            "difficulty": "A",
                            "time_minutes": 15,
                            "reason": "五花肉临期，适合先消耗。",
                            "fit_tags": ["临期优先", "下饭"],
                            "tags": ["炒", "家常", "快手"],
                            "ingredients": ["五花肉 200g", "青椒 2 个", "蒜 2 瓣", "酱油 1 勺"],
                            "core_ingredients": ["五花肉", "青椒"],
                            "optional_ingredients": ["蒜", "酱油"],
                            "matched_inventory": ["五花肉", "青椒"],
                            "missing_ingredients": ["酱油"],
                            "steps": ["五花肉切片。", "青椒切块。", "先煸五花肉，再下青椒翻炒。", "补少量酱油收汁出锅。"],
                            "nutrition_tags": ["low_sugar"],
                            "allergen_tags": [],
                            "constraint_tags": ["dairy_free"],
                        }
                    ],
                },
                ensure_ascii=False,
            )

        with patch("backend.services.orchestrator.llm_is_configured", return_value=True):
            with patch("backend.services.orchestrator.chat", side_effect=fake_chat):
                recommend_response = client.post(
                    "/api/v1/recommend",
                    json={"user_id": "default", "tags": ["消耗临期"], "context": {}},
                )

        self.assertEqual(recommend_response.status_code, 200)
        recipe_id = recommend_response.json()["plans"][0]["dishes"][0]["recipe_id"]
        detail_response = client.get(f"/api/v1/recipe/{recipe_id}?user_id=default")
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.json()["name"], "辣椒炒肉")
        self.assertGreaterEqual(len(detail_response.json()["steps"]), 3)

    def test_checked_shopping_items_can_be_added_to_inventory(self) -> None:
        add_manual_shopping_item(
            "default",
            display_name="鸡蛋",
            normalized_name="egg",
            category="meat_poultry_eggs",
            quantity_text="",
            recommended_quantity_text="12个",
            reason="多道推荐菜缺少 鸡蛋",
        )
        add_manual_shopping_item(
            "default",
            display_name="牛奶",
            normalized_name="milk",
            category="dairy",
            quantity_text="2盒",
            recommended_quantity_text="2盒",
            reason="早餐常备",
        )
        shopping_items = list_shopping_list_items("default")
        database.update_shopping_list_item("default", shopping_items[0]["id"], checked=True)
        database.update_shopping_list_item("default", shopping_items[1]["id"], checked=True)

        inventory_items, remaining_shopping_items, moved_count = add_shopping_items_to_inventory("default")

        inventory_map = {item["normalized_name"]: item["quantity_text"] for item in inventory_items}
        self.assertEqual(moved_count, 2)
        self.assertEqual(inventory_map["egg"], "12个")
        self.assertEqual(inventory_map["milk"], "2盒")
        self.assertEqual(remaining_shopping_items, [])

    def test_complete_recipe_deducts_inventory(self) -> None:
        upsert_inventory_items(
            "default",
            [
                build_inventory_candidate("番茄", quantity_text="2个"),
                build_inventory_candidate("豆腐", quantity_text="1盒"),
                build_inventory_candidate("鸡蛋", quantity_text="4个"),
            ],
        )

        asyncio.run(
            complete_recipe(
                "r_001",
                RecipeCompletionRequest(user_id="default", usage_mode="all"),
            )
        )
        remaining_tokens = {item["normalized_name"] for item in database.list_inventory("default")}
        self.assertNotIn("tofu", remaining_tokens)
        self.assertNotIn("egg", remaining_tokens)

    def test_manual_shopping_items_merge_quantity(self) -> None:
        add_manual_shopping_item(
            "default",
            display_name="圣女果",
            normalized_name="tomato_cherry",
            category="vegetables_tofu",
            quantity_text="1盒",
            recommended_quantity_text="1盒",
            reason="自然语言补货",
        )
        add_manual_shopping_item(
            "default",
            display_name="小番茄",
            normalized_name="tomato_cherry",
            category="vegetables_tofu",
            quantity_text="2盒",
            recommended_quantity_text="2盒",
            reason="语音补货",
        )

        items = list_shopping_list_items("default")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["quantity_text"], "3盒")
        self.assertIn("语音补货", items[0]["reason"])

    def test_condiment_missing_enters_shopping_suggestions(self) -> None:
        upsert_inventory_items(
            "default",
            [build_inventory_candidate("生菜", quantity_text="1颗")],
        )

        result = asyncio.run(recommend(RecommendRequest(user_id="default", tags=["快手菜"])))
        summary = {(item.display_name, item.category) for item in result.shopping_suggestions}
        self.assertIn(("蚝油", "pantry_condiments"), summary)

    def test_purchase_frequency_changes_recommended_quantity(self) -> None:
        update_body_profile("default", household_size=2, purchase_frequency_per_week=1)
        low_freq = asyncio.run(recommend(RecommendRequest(user_id="default", tags=["快手菜"])))
        low_freq_item = next(item for item in low_freq.shopping_suggestions if item.display_name == "鸡蛋")

        update_body_profile("default", purchase_frequency_per_week=4)
        high_freq = asyncio.run(recommend(RecommendRequest(user_id="default", tags=["快手菜"])))
        high_freq_item = next(item for item in high_freq.shopping_suggestions if item.display_name == "鸡蛋")
        self.assertNotEqual(low_freq_item.recommended_quantity_text, high_freq_item.recommended_quantity_text)

    def test_image_recognition_failures_return_non_empty_detail(self) -> None:
        client = TestClient(app)
        cases = [
            ImageRecognitionError("未配置图片识别模型", 503),
            ImageRecognitionError("模型鉴权失败", 403),
            ImageRecognitionError("图片识别限流，请稍后重试", 429),
            ImageRecognitionError("图片识别结果不可解析，请换一张更清晰的图片", 502),
        ]

        for error in cases:
            with self.subTest(detail=error.detail):
                with patch.object(inventory_router, "recognize_from_uploaded_file", side_effect=error):
                    response = client.post(
                        "/api/v1/inventory/recognize?user_id=default&source_type=image",
                        files={"file": ("demo.jpg", b"image-bytes", "image/jpeg")},
                    )
                self.assertEqual(response.status_code, error.status_code)
                self.assertTrue(response.json()["detail"])

    def test_video_reference_falls_back_to_search_url(self) -> None:
        service = VideoReferenceService()
        reference = service.get_video_reference("番茄豆腐蛋花汤")
        self.assertEqual(reference.provider, "rednote_search_url")
        self.assertIn("xiaohongshu.com", reference.url)

    def test_profile_exposes_bmi_and_athlete_fields(self) -> None:
        update_body_profile(
            "default",
            height=180,
            weight=72,
            sport_type="羽毛球",
            training_days_per_week=5,
            training_intensity="high",
            competition_cycle="build",
            training_notes="周二力量，周六对抗。",
        )

        profile = get_profile("default")
        self.assertIsNotNone(profile)
        assert profile is not None
        self.assertEqual(profile["profile"]["bmi"], 22.2)
        self.assertEqual(profile["profile"]["sport_type"], "羽毛球")
        self.assertEqual(profile["profile"]["training_days_per_week"], 5)
        self.assertEqual(profile["profile"]["training_intensity"], "high")
        self.assertEqual(profile["profile"]["competition_cycle"], "build")

    def test_inventory_endpoint_returns_macro_estimates(self) -> None:
        upsert_inventory_items(
            "default",
            [build_inventory_candidate("鸡蛋", quantity_text="2个")],
        )

        client = TestClient(app)
        response = client.get("/api/v1/inventory/default")
        self.assertEqual(response.status_code, 200)
        egg = next(item for item in response.json()["items"] if item["normalized_name"] == "egg")
        self.assertAlmostEqual(egg["macros"]["protein_g"], 12.6, places=1)
        self.assertAlmostEqual(egg["macros"]["fat_g"], 10.6, places=1)
        self.assertTrue(egg["macros"]["estimated"])

    def test_athlete_context_is_passed_into_recommendation_scoring(self) -> None:
        update_body_profile(
            "default",
            sport_type="游泳",
            training_days_per_week=6,
            training_intensity="double_session",
            competition_cycle="build",
        )

        captured: dict[str, object] = {}

        class StubKnowledgeService:
            recipes = []

            def list_candidate_hits(self, **kwargs):
                captured.update(kwargs)
                return []

        with patch("backend.services.orchestrator.get_knowledge_service", return_value=StubKnowledgeService()):
            asyncio.run(recommend(RecommendRequest(user_id="default", tags=["增肌"])))

        self.assertEqual(captured["athlete_context"]["training_intensity"], "double_session")
        self.assertEqual(captured["athlete_context"]["competition_cycle"], "build")
        weights = captured["preference_weights"]
        self.assertGreater(weights["high_protein"], 0)

    def test_weekly_recommend_blocks_until_key_ingredients_are_added(self) -> None:
        class StubKnowledgeService:
            recipes = []

            def list_candidate_hits(self, **kwargs):
                del kwargs
                return [
                    RecipeHit(
                        recipe_id="r_001",
                        title="番茄豆腐蛋花汤",
                        tags=["汤"],
                        difficulty="A",
                        time_minutes=15,
                        matched_ingredients=["番茄"],
                        missing_ingredients=[],
                        fit_tags=["快手"],
                        score=8.0,
                    ),
                    RecipeHit(
                        recipe_id="r_002",
                        title="青椒鸡胸肉快炒",
                        tags=["炒"],
                        difficulty="A",
                        time_minutes=18,
                        matched_ingredients=["鸡胸肉"],
                        missing_ingredients=[],
                        fit_tags=["高蛋白"],
                        score=7.5,
                    ),
                    RecipeHit(
                        recipe_id="r_003",
                        title="西兰花虾仁",
                        tags=["清淡"],
                        difficulty="B",
                        time_minutes=20,
                        matched_ingredients=["虾仁"],
                        missing_ingredients=[],
                        fit_tags=["恢复友好"],
                        score=7.2,
                    ),
                ]

        with patch("backend.services.orchestrator.get_knowledge_service", return_value=StubKnowledgeService()):
            result = asyncio.run(recommend_weekly(RecommendRequest(user_id="default", tags=["运动后恢复"])))

        self.assertEqual(result.status, "needs_ingredients")
        self.assertGreaterEqual(len(result.required_ingredients), 1)
        self.assertTrue(result.blocking_reasons)

    def test_weekly_recommend_returns_seven_days_when_inventory_is_sufficient(self) -> None:
        class StubKnowledgeService:
            recipes = []

            def list_candidate_hits(self, **kwargs):
                del kwargs
                return [
                    RecipeHit(
                        recipe_id="r_001",
                        title="番茄豆腐蛋花汤",
                        tags=["汤"],
                        difficulty="A",
                        time_minutes=15,
                        matched_ingredients=["番茄", "豆腐", "鸡蛋"],
                        missing_ingredients=[],
                        fit_tags=["快手"],
                        score=8.0,
                    ),
                    RecipeHit(
                        recipe_id="r_002",
                        title="青椒鸡胸肉快炒",
                        tags=["炒"],
                        difficulty="A",
                        time_minutes=18,
                        matched_ingredients=["鸡胸肉", "青椒"],
                        missing_ingredients=[],
                        fit_tags=["高蛋白"],
                        score=7.8,
                    ),
                    RecipeHit(
                        recipe_id="r_003",
                        title="西兰花虾仁",
                        tags=["清淡"],
                        difficulty="B",
                        time_minutes=20,
                        matched_ingredients=["西兰花", "虾仁"],
                        missing_ingredients=[],
                        fit_tags=["恢复友好"],
                        score=7.4,
                    ),
                    RecipeHit(
                        recipe_id="r_004",
                        title="香菇豆腐煲",
                        tags=["煲"],
                        difficulty="B",
                        time_minutes=25,
                        matched_ingredients=["豆腐", "香菇"],
                        missing_ingredients=[],
                        fit_tags=["家常"],
                        score=7.0,
                    ),
                ]

        with patch("backend.services.orchestrator.get_knowledge_service", return_value=StubKnowledgeService()):
            result = asyncio.run(recommend_weekly(RecommendRequest(user_id="default", tags=["增肌"])))

        self.assertEqual(result.status, "ready")
        self.assertEqual(len(result.days), 7)
        self.assertTrue(all(day.plan.dishes for day in result.days))


if __name__ == "__main__":
    unittest.main()
