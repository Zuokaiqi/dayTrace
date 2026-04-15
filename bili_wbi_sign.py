"""
B站 Wbi 签名算法逆向 - w_rid 参数生成

算法来源: B站前端 JS (fresh-space/assets/index-*.js)
接口示例: /x/space/wbi/arc/search (UP主稿件列表)
"""

import hashlib
import time
import urllib.parse
import requests

# 固定的重排索引表 (从 B站前端 JS 提取)
MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]


def get_mixin_key(img_key: str, sub_key: str) -> str:
    """
    将 img_key + sub_key 拼接后, 按 MIXIN_KEY_ENC_TAB 重排, 取前32位
    """
    orig = img_key + sub_key
    return "".join(orig[i] for i in MIXIN_KEY_ENC_TAB if i < len(orig))[:32]


def sign_params(params: dict, img_key: str, sub_key: str) -> dict:
    """
    对请求参数进行 Wbi 签名, 返回添加了 w_rid 和 wts 的参数字典

    算法步骤:
    1. 生成 mixin_key = getMixinKey(img_key + sub_key)
    2. 添加 wts = 当前时间戳(秒)
    3. 按 key 字典序排序
    4. 对 string 类型的 value, 移除 [!'()*] 字符
    5. 对 key 和 value 分别 encodeURIComponent
    6. 拼接为 query string, 末尾追加 mixin_key
    7. MD5 哈希 -> w_rid
    """
    mixin_key = get_mixin_key(img_key, sub_key)
    wts = str(round(time.time()))
    params = {**params, "wts": wts}

    # 按 key 排序
    sorted_keys = sorted(params.keys())

    # 构建 query string
    import re
    filter_re = re.compile(r"[!'()*]")

    parts = []
    for key in sorted_keys:
        value = params[key]
        # 对 string 值过滤特殊字符
        if value and isinstance(value, str):
            value = filter_re.sub("", value)
        if value is not None:
            parts.append(
                f"{urllib.parse.quote(str(key), safe='')}"
                f"="
                f"{urllib.parse.quote(str(value), safe='')}"
            )

    query_string = "&".join(parts)

    # MD5(query_string + mixin_key) = w_rid
    w_rid = hashlib.md5((query_string + mixin_key).encode("utf-8")).hexdigest()

    params["w_rid"] = w_rid
    return params


def get_wbi_keys() -> tuple[str, str]:
    """
    从 /x/web-interface/nav 接口获取 img_key 和 sub_key
    """
    resp = requests.get(
        "https://api.bilibili.com/x/web-interface/nav",
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "Referer": "https://www.bilibili.com/",
        },
    )
    data = resp.json()["data"]["wbi_img"]
    img_url = data["img_url"]  # https://i0.hdslb.com/bfs/wbi/xxxxx.png
    sub_url = data["sub_url"]

    # 从 URL 中提取文件名(去掉扩展名)作为 key
    img_key = img_url.rsplit("/", 1)[-1].split(".")[0]
    sub_key = sub_url.rsplit("/", 1)[-1].split(".")[0]

    return img_key, sub_key


class BiliClient:
    """B站 API 客户端, 自动处理 Wbi 签名 + 风控 cookie"""

    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com/",
    }

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(self.HEADERS)
        self.img_key = ""
        self.sub_key = ""
        self._init()

    def _init(self):
        """初始化: 获取 buvid + wbi keys + bili_ticket"""
        # 1. 获取 buvid3/buvid4 (通过 spi 接口)
        resp = self.session.get("https://api.bilibili.com/x/frontend/finger/spi")
        data = resp.json().get("data", {})
        buvid3 = data.get("b_3", "")
        buvid4 = data.get("b_4", "")
        self.session.cookies.set("buvid3", buvid3, domain=".bilibili.com")
        self.session.cookies.set("buvid4", buvid4, domain=".bilibili.com")
        print(f"buvid3: {buvid3[:20]}...")

        # 2. 获取 wbi keys (nav 接口)
        resp = self.session.get("https://api.bilibili.com/x/web-interface/nav")
        nav_data = resp.json()["data"]
        wbi = nav_data["wbi_img"]
        self.img_key = wbi["img_url"].rsplit("/", 1)[-1].split(".")[0]
        self.sub_key = wbi["sub_url"].rsplit("/", 1)[-1].split(".")[0]
        print(f"img_key: {self.img_key}")
        print(f"sub_key: {self.sub_key}")
        print(f"mixin_key: {get_mixin_key(self.img_key, self.sub_key)}")

        # 3. 获取 bili_ticket
        self._get_ticket()

    def _get_ticket(self):
        """获取 bili_ticket (用于风控校验)"""
        import hmac
        ts = int(time.time())
        hex_sign = hmac.new(b"XgwSnGZ1p", f"ts{ts}".encode(), hashlib.sha256).hexdigest()
        resp = self.session.post(
            "https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket",
            params={
                "key_id": "ec02",
                "hexsign": hex_sign,
                "context[ts]": str(ts),
                "csrf": "",
            },
        )
        data = resp.json().get("data", {})
        ticket = data.get("ticket", "")
        if ticket:
            self.session.cookies.set("bili_ticket", ticket, domain=".bilibili.com")
            print(f"bili_ticket: {ticket[:20]}...")

    def get_up_videos(self, mid: int, page: int = 1, page_size: int = 30):
        """获取 UP主稿件列表"""
        import base64
        import json
        # 设备指纹参数 (模拟浏览器 WebGL 指纹)
        dm_img_str = base64.b64encode(b"WebGL 1.0 (OpenGL ES 2.0 Chromium)").decode().rstrip("=")
        dm_cover_img_str = base64.b64encode(
            b"ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)Google Inc. (NVIDIA"
        ).decode().rstrip("=")

        params = {
            "mid": str(mid),
            "pn": str(page),
            "ps": str(page_size),
            "tid": "0",
            "order": "pubdate",
            "keyword": "",
            "platform": "web",
            "web_location": "333.1387",
            "order_avoided": "true",
            "dm_img_list": "[]",
            "dm_img_str": dm_img_str,
            "dm_cover_img_str": dm_cover_img_str,
            "dm_img_inter": json.dumps({"ds": [], "wh": [3711, 4502, 15], "of": [87, 174, 87]}),
        }

        signed = sign_params(params, self.img_key, self.sub_key)
        print(f"\nw_rid: {signed['w_rid']}")
        print(f"wts: {signed['wts']}")

        self.session.headers["Referer"] = f"https://space.bilibili.com/{mid}/video"
        resp = self.session.get(
            "https://api.bilibili.com/x/space/wbi/arc/search",
            params=signed,
        )
        result = resp.json()
        print(f"\nHTTP Status: {resp.status_code}")
        print(f"API code: {result.get('code')}")
        print(f"API message: {result.get('message')}")

        if result.get("code") == 0:
            vlist = result["data"]["list"]["vlist"]
            total = result["data"]["page"]["count"]
            print(f"\n共 {total} 个视频, 当前页 {len(vlist)} 个:\n")
            for v in vlist[:5]:
                print(f"  [{v['bvid']}] {v['title']}")
                print(f"    播放: {v['play']}  评论: {v['comment']}")
            if len(vlist) > 5:
                print(f"  ... 还有 {len(vlist) - 5} 个")
        else:
            print(f"\n请求失败: {result}")

        return result


if __name__ == "__main__":
    client = BiliClient()
    client.get_up_videos(546195)
