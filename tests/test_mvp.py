from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path

from backend import database
from backend.database import (
    add_manual_shopping_item,
    init_db,
    list_shopping_list_items,
    record_feedback_event,
    update_preferences,
    upsert_inventory_items,
)
from backend.routers.recipe import complete_recipe
from backend.schemas.feedback import RecipeCompletionRequest
from backend.schemas.recommend import RecommendRequest
from backend.services import orchestrator
from backend.services.ingredient_service import build_inventory_candidate, parse_freeform_inventory_text
from backend.services.knowledge_service import get_knowledge_service
from backend.services.orchestrator import recommend
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

    def test_uncommon_compound_ingredient_is_not_split_by_single_char_alias(self) -> None:
        items = parse_freeform_inventory_text("一斤皮皮虾")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["display_name"], "皮皮虾")
        self.assertEqual(items[0]["normalized_name"], "皮皮虾")
        self.assertEqual(items[0]["quantity_text"], "一斤")

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
            quantity_text="1盒",
            reason="自然语言补货",
        )
        add_manual_shopping_item(
            "default",
            display_name="小番茄",
            normalized_name="tomato_cherry",
            quantity_text="2盒",
            reason="语音补货",
        )

        items = list_shopping_list_items("default")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["quantity_text"], "3盒")
        self.assertIn("语音补货", items[0]["reason"])

    def test_video_reference_falls_back_to_search_url(self) -> None:
        service = VideoReferenceService()
        reference = service.get_video_reference("番茄豆腐蛋花汤")
        self.assertEqual(reference.provider, "rednote_search_url")
        self.assertIn("xiaohongshu.com", reference.url)


if __name__ == "__main__":
    unittest.main()
