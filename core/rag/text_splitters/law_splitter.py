import re
from typing import List, Dict, Any, Optional
from langchain_core.documents import Document

def extract_law_metadata(text: str) -> Dict[str, Any]:
    """提取法律文档头部元信息（年份、会议、修订时间）"""
    passed_date_match = re.search(r"（?(\d{4}年\d{1,2}月\d{1,2}日)[^）]{0,20}通过", text)
    revised_dates = re.findall(r"(?:根据)?(\d{4}年\d{1,2}月\d{1,2}日)[^）]{0,20}(?:修正|修改)", text)
    meetings = re.findall(r"(第[一二三四五六七八九十]{1,3}届全国人民代表大会常务委员会[^）]*会议)", text)
    return {
        "passed_date": passed_date_match.group(1) if passed_date_match else None,
        "revised_date": revised_dates,
        "meetings": meetings,
    }

def convert_cn_to_int(cn: str) -> int:
    """中文数字转整数，支持千、万、亿等大数字"""
    mapping = {
        '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
        '百': 100, '千': 1000, '万': 10000, '亿': 100000000
    }
    
    # 特殊处理，如果是"千"开头，确保正确处理"一千"等
    if cn.startswith('千'):
        return 1000 + convert_cn_to_int(cn[1:]) if len(cn) > 1 else 1000
    
    # 特殊处理"十"开头的数字
    if cn.startswith('十'):
        return 10 + convert_cn_to_int(cn[1:]) if len(cn) > 1 else 10
    
    # 检查是否包含"千"
    if "千" in cn:
        parts = cn.split("千", 1)
        # 处理"一千"、"二千"等
        if parts[0]:
            qian_num = convert_cn_to_int(parts[0])
        else:
            qian_num = 1  # 如果没有前缀数字，默认为1
        
        # 处理"一千零一"、"一千一百"等
        if parts[1]:
            return qian_num * 1000 + convert_cn_to_int(parts[1])
        else:
            return qian_num * 1000
    
    # 检查是否包含"百"
    if "百" in cn:
        parts = cn.split("百", 1)
        # 处理"一百"、"二百"等
        if parts[0]:
            bai_num = convert_cn_to_int(parts[0])
        else:
            bai_num = 1  # 如果没有前缀数字，默认为1
        
        # 处理"一百零一"、"一百一十"等
        if parts[1]:
            return bai_num * 100 + convert_cn_to_int(parts[1])
        else:
            return bai_num * 100
    
    # 检查是否包含"十"
    if "十" in cn:
        parts = cn.split("十", 1)
        # 处理"一十"、"二十"等
        if parts[0]:
            shi_num = convert_cn_to_int(parts[0])
        else:
            shi_num = 1  # 如果没有前缀数字，默认为1
        
        # 处理"一十一"、"二十二"等
        if parts[1]:
            return shi_num * 10 + convert_cn_to_int(parts[1])
        else:
            return shi_num * 10
    
    # 处理个位数字
    if cn in mapping:
        return mapping[cn]
    
    # 处理连续的数字，如"一二三"
    if cn:
        result = 0
        for c in cn:
            if c in mapping:
                result = result * 10 + mapping[c]
        return result
    
    return 0  # 默认返回0

def split_by_chapter_section_article(
    text: str,
    source: str = "",
    # 是否需要概览块
    include_overview: bool = False,
    preserve_format: bool = True
) -> List[Document]:
    """
    将法律文档按照条款进行切分，每个块包含：
      - 法律名称及头部元信息
      - 具体条款内容（每条独立成一个块）
    
    条款识别逻辑：
      - 检测到"第X条"开始一个新条款
      - 直到遇到序号递增的下一条("第X+1条")才结束当前条款
      - 如果中间出现了其他序号，视为当前条款的引用内容
    
    参数：
      text: 整个法律文档的文本内容
      source: 文档来源
      include_overview: 是否包含法律总览信息，默认True
      preserve_format: 是否保留原始格式，默认True
    """
    documents = []
    # 将文本按行拆分，并过滤掉空行
    lines = text.splitlines()
    lines = [line.rstrip() for line in lines if line.strip() != ""]
    
    # 提取法律名称和头部信息
    law_title_match = re.search(r'^([\u4e00-\u9fa5《》、]{4,}法)', text)
    law_title = law_title_match.group(1) if law_title_match else "未知法律"
    
    # 提取头部信息
    header_lines = []
    i = 0
    while i < len(lines):
        if re.match(r'^第[一二三四五六七八九十百千万零]+条', lines[i]):
            break
        header_lines.append(lines[i])
        i += 1
    
    # 保存头部信息为独立块
    if header_lines:
        header_info = "\n".join(header_lines)
        header_meta = {
            "source": source,
            "content_type": "header",
            "level": "header",
            "law_name": law_title,
            **extract_law_metadata(header_info)
        }
        documents.append(Document(page_content=header_info, metadata=header_meta))
    
    # 定义条款正则模式 - 修改以匹配更复杂的条款号
    article_pat = re.compile(r'^第([一二三四五六七八九十百千万零]+)条(.*)')
    
    # 用于收集当前条款内容
    current_article_num = None
    current_article_cn = None
    article_buffer = []
    
    # 处理所有行
    while i < len(lines):
        line = lines[i]
        
        # 检测"第X条"
        article_match = article_pat.match(line)
        if article_match:
            # 获取条款序号（中文和数字形式）
            article_cn = article_match.group(1)
            try:
                article_num_val = convert_cn_to_int(article_cn)
                
                # 添加调试信息
                print(f"识别到条款: 第{article_cn}条 -> {article_num_val}")
                
                # 如果已有收集的条款内容，且当前条款序号不同于上一个序号，将上一个条款保存为文档
                if current_article_num is not None and article_num_val != current_article_num:
                    # 保存之前收集的条款
                    content = f"{law_title}\n\n" + "\n".join(article_buffer)
                    meta = {
                        "source": source,
                        "content_type": "article_content",
                        "level": "article",
                        "law_name": law_title,
                        "article": f"第{current_article_cn}条",
                        "article_num": current_article_num,
                    }
                    documents.append(Document(page_content=content, metadata=meta))
                    
                    # 重置缓冲区
                    article_buffer = []
                
                # 更新当前条款信息
                current_article_num = article_num_val
                current_article_cn = article_cn
                
                # 将当前行添加到缓冲区
                article_content = article_match.group(2).strip()
                article_buffer.append(f"第{article_cn}条 {article_content}")
            except Exception as e:
                # 转换失败时添加错误日志，并尝试继续处理
                print(f"条款序号转换失败: 第{article_cn}条, 错误: {str(e)}")
                # 继续使用之前的条款号
                if current_article_num is not None:
                    article_buffer.append(line)
        else:
            # 普通内容行，追加到当前条款缓冲区
            if current_article_num is not None:
                article_buffer.append(line)
        
        i += 1
    
    # 保存最后一个条款
    if article_buffer:
        content = f"{law_title}\n\n" + "\n".join(article_buffer)
        meta = {
            "source": source,
            "content_type": "article_content",
            "level": "article",
            "law_name": law_title,
            "article": f"第{current_article_cn}条",
            "article_num": current_article_num,
        }
        documents.append(Document(page_content=content, metadata=meta))
    
    # 如果需要法律概览，添加章节概览块
    # if include_overview and documents:
    #     # 收集所有条款编号
    #     article_nums = []
    #     for doc in documents:
    #         if doc.metadata.get("content_type") == "article_content":
    #             article_num = doc.metadata.get("article_num")
    #             if article_num:
    #                 article_nums.append(article_num)
        
    #     # 创建法律概览
    #     if article_nums:
    #         article_nums.sort()
    #         overview_content = f"{law_title} 包含以下条款: " + "、".join([f"第{num}条" for num in article_nums])
    #         overview_meta = {
    #             "source": source,
    #             "content_type": "law_overview",
    #             "level": "overview",
    #             "law_name": law_title,
    #         }
    #         # 将概览放在文档列表开头
    #         documents.insert(1, Document(page_content=overview_content, metadata=overview_meta))
    
    return documents