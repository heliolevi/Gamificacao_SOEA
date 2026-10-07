import math


def calcular_nivel(pontos: int | None) -> int:
    return int(math.sqrt((pontos or 0) / 50)) + 1
