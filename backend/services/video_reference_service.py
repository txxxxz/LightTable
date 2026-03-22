from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from urllib.parse import quote

from backend.core.config import REDNOTE_MCP_COMMAND


@dataclass
class VideoReferenceResult:
    provider: str
    title: str
    url: str
    available: bool = True


class RedNoteMCPProvider:
    """
    Demo-first provider.

    If a local RedNote MCP helper command is configured, we try to execute it.
    Otherwise return None and let the fallback provider chain handle the request.
    """

    def __init__(self, command: list[str] | None = None) -> None:
        self.command = command or []

    def search(self, query: str) -> VideoReferenceResult | None:
        if not self.command:
            return None
        executable = self.command[0]
        if shutil.which(executable) is None:
            return None
        try:
            completed = subprocess.run(
                [*self.command, query],
                check=True,
                capture_output=True,
                text=True,
                timeout=8,
            )
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return None

        url = completed.stdout.strip()
        if not url.startswith("http"):
            return None
        return VideoReferenceResult(
            provider="rednote_mcp",
            title=f"小红书菜谱参考：{query}",
            url=url,
        )


class RedNoteSearchUrlProvider:
    def search(self, query: str) -> VideoReferenceResult:
        return VideoReferenceResult(
            provider="rednote_search_url",
            title=f"小红书搜索：{query}",
            url=f"https://www.xiaohongshu.com/search_result?keyword={quote(query)}",
        )


class GenericVideoSearchProvider:
    def search(self, query: str) -> VideoReferenceResult:
        return VideoReferenceResult(
            provider="generic_video_search",
            title=f"视频菜谱搜索：{query}",
            url=f"https://www.bing.com/videos/search?q={quote(query)}",
        )


class VideoReferenceService:
    def __init__(self) -> None:
        command = REDNOTE_MCP_COMMAND.split() if REDNOTE_MCP_COMMAND else None
        self.rednote_mcp = RedNoteMCPProvider(command=command)
        self.rednote_search = RedNoteSearchUrlProvider()
        self.generic_search = GenericVideoSearchProvider()

    def get_video_reference(self, recipe_name: str) -> VideoReferenceResult:
        query = f"{recipe_name} 做法"
        for provider in (self.rednote_mcp, self.rednote_search, self.generic_search):
            result = provider.search(query)
            if result is not None:
                return result
        return self.generic_search.search(query)


_video_reference_service: VideoReferenceService | None = None


def get_video_reference_service() -> VideoReferenceService:
    global _video_reference_service
    if _video_reference_service is None:
        _video_reference_service = VideoReferenceService()
    return _video_reference_service
