import re
from typing import List

from langchain.text_splitter import CharacterTextSplitter


class ChineseTextSplitter(CharacterTextSplitter):
    def __init__(self, pdf: bool = False, sentence_size: int = 250, **kwargs):
        super().__init__(**kwargs)
        self.pdf = pdf
        self.sentence_size = sentence_size

    def split_text1(self, text: str) -> List[str]:
        if self.pdf:
            text = re.sub(r"\n{3,}", "\n", text)
            text = re.sub(r"\s", " ", text)
            text = text.replace("\n\n", "")
        # 简化正则表达式，避免复杂的引号匹配
        sent_sep_pattern = re.compile(
            r"([﹒﹔﹖﹗．。！？])"
        )
        sent_list = []
        for ele in sent_sep_pattern.split(text):
            if sent_sep_pattern.match(ele) and sent_list:
                sent_list[-1] += ele
            elif ele:
                sent_list.append(ele)
        return sent_list

    def split_text(self, text: str) -> List[str]:
        if self.pdf:
            text = re.sub(r"\n{3,}", r"\n", text)
            text = re.sub(r"\s", " ", text)
            text = re.sub(r"\n\n", "", text)

        # 简化正则表达式，避免复杂的引号匹配
        text = re.sub(r"([;；.!?。！？\?])", r"\1\n", text)  # 单字符断句符
        text = re.sub(r"(\.{6})", r"\1\n", text)  # 英文省略号
        text = re.sub(r"(\…{2})", r"\1\n", text)  # 中文省略号
        
        text = text.rstrip()  # 段尾如果有多余的\n就去掉它
        ls = [i for i in text.split("\n") if i]
        
        # 简化过长文本的处理逻辑
        result = []
        for ele in ls:
            if len(ele) <= self.sentence_size:
                result.append(ele)
            else:
                # 按逗号分割
                comma_split = re.split(r"([,，])", ele)
                temp = []
                current_piece = ""
                for idx, piece in enumerate(comma_split):
                    if idx % 2 == 1:  # 这是分隔符
                        current_piece += piece
                    else:
                        if len(current_piece + piece) > self.sentence_size and current_piece:
                            temp.append(current_piece)
                            current_piece = piece
                        else:
                            current_piece += piece
                if current_piece:
                    temp.append(current_piece)
                
                # 如果分割后的片段仍然太长，则按空格分割
                final_pieces = []
                for piece in temp:
                    if len(piece) <= self.sentence_size:
                        final_pieces.append(piece)
                    else:
                        space_split = re.split(r"( )", piece)
                        current_piece = ""
                        for idx, subpiece in enumerate(space_split):
                            if idx % 2 == 1:  # 这是分隔符
                                current_piece += subpiece
                            else:
                                if len(current_piece + subpiece) > self.sentence_size and current_piece:
                                    final_pieces.append(current_piece)
                                    current_piece = subpiece
                                else:
                                    current_piece += subpiece
                        if current_piece:
                            final_pieces.append(current_piece)
                
                result.extend(final_pieces)
        
        return result