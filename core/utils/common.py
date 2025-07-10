import time
import random
import hashlib
import os
import json
from datetime import datetime

class Fore:
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    CYAN = "\033[96m"
    RESET = "\033[0m"

def print_colorful(
    *text,
    text_color=None,
    time_color=None,
    sep: str = " ",
    end: str = "\n",
    file=None,
    flush: bool = False,
):
    timestamp = time.strftime("%y/%m/%d %H:%M:%S") + " : "
    text = sep.join(list(map(str, text)))
    text = text_color + text + Fore.RESET if text_color is not None else text
    time_str = time_color + timestamp + Fore.RESET if time_color else timestamp
    print(f"{time_str}{text}", end=end, file=file, flush=flush)

def log_message(model_name, user_msg, response_msg, history_path=None):
    time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"{Fore.CYAN}[时间] {time_str}{Fore.RESET}")
    print(f"{Fore.GREEN}[模型] {model_name}{Fore.RESET}")
    print(f"{Fore.YELLOW}[用户] {user_msg}{Fore.RESET}")
    print(f"{Fore.CYAN}[回复] {response_msg}{Fore.RESET}")
    if history_path:
        print(f"{Fore.GREEN}[历史保存] {history_path}{Fore.RESET}")
    print("—" * 60)

def random_icon(idx=None):
    icons = "🍇🍈🍉🍊🍋🍌🍍🥭🍎🍏🍐🍑🍒🍓"
    n = len(icons)
    if idx is None:
        return random.sample(icons, 1)[0]
    else:
        return icons[idx % n]

def get_hash_of_file(path):
    """获取文件的MD5哈希值"""
    with open(path, "rb") as f:
        readable_hash = hashlib.md5(f.read()).hexdigest()
    return readable_hash

def read_json_file(path):
    """安全地读取JSON文件"""
    if not os.path.exists(path):
        return {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print_colorful(f"读取JSON文件出错: {e}", text_color=Fore.RED)
        return {}

def save_json_file(data, path):
    """安全地保存JSON数据到文件"""
    try:
        directory = os.path.dirname(path)
        if not os.path.exists(directory):
            os.makedirs(directory)
            
        # 先写入临时文件
        temp_path = f"{path}.temp"
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())  # 确保数据写入磁盘

        # 如果存在原文件，先创建备份
        if os.path.exists(path) and os.path.getsize(path) > 5:
            backup_path = f"{path}.bak"
            import shutil
            shutil.copy2(path, backup_path)
            
        # 重命名临时文件为目标文件
        if os.path.exists(path):
            os.remove(path)
        os.rename(temp_path, path)
        
        return True
    except Exception as e:
        print_colorful(f"保存JSON文件出错: {e}", text_color=Fore.RED)
        return False