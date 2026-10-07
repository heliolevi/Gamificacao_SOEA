"""Cache curto em memória, por instância serverless, para rotas de leitura pesada."""
import threading
import time

from database import banco_dados

_cache_lock = threading.Lock()
_cache: dict[str, tuple[float, object]] = {}

RANKING_CACHE_TTL = 8   # segundos — pontos mudam com frequência durante o evento
OPCOES_CACHE_TTL = 300  # segundos — enums quase nunca mudam


def cache_get(chave: str, ttl: float):
    with _cache_lock:
        item = _cache.get(chave)
    if item and (time.time() - item[0]) < ttl:
        return item[1]
    return None


def cache_set(chave: str, valor) -> None:
    with _cache_lock:
        _cache[chave] = (time.time(), valor)


def valores_enum(nome: str) -> list[str]:
    chave = f"opcoes:{nome}"
    hit = cache_get(chave, OPCOES_CACHE_TTL)
    if hit is not None:
        return hit
    res = banco_dados.rpc("get_enum_values", {"enum_name": nome}).execute()
    valores = res.data or []
    cache_set(chave, valores)
    return valores
