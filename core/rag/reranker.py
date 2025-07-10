import requests

def get_reranker(reranker_cfg: dict):
    """获取重排序器"""
    if not reranker_cfg:
        return None
        
    provider = reranker_cfg.get('provider', '')
    model_name = reranker_cfg.get('model_name', '')
    
    if not provider or not model_name:
        return None
    
    if provider == 'siliconflow':
        return SiliconflowReranker(
            model_name=model_name,
            api_key=reranker_cfg.get('api_key', '')
        )
    
    return None

class SiliconflowReranker:
    """Silicon Flow 重排序器"""
    def __init__(self, model_name, api_key) -> None:
        self.model = model_name
        self.api_key = api_key
        self.base_url = "https://api.siliconflow.cn/v1/rerank"

    def _get_score(self, query, docs, top_n=None) -> list[float]:
        payload = {
            "model": self.model,
            "query": query,
            "documents": docs,
            "top_n": top_n,
            "return_documents": True,
            "max_chunks_per_doc": 123,
            "overlap_tokens": 79,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        response = requests.request(
            "POST", self.base_url, json=payload, headers=headers
        )
        response = sorted(response.json()["results"], key=lambda x: x["index"])
        response = [i["relevance_score"] for i in response]
        return response

    def compute_score(self, docs: list, top_n=None) -> list[float]:
        if not docs:
            return []
        query = docs[0][0]
        docs = [i[1] for i in docs]
        top_n = top_n or len(docs)
        return self._get_score(query=query, docs=docs, top_n=top_n)