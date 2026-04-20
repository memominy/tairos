"""LlmInventoryAnalyst — the reference LLM-backed agent.

This is the LLM-sibling of ``InventoryAnalyst``. It has access to the
same ``list_nodes`` / ``count_nodes`` tools, but instead of a
hard-coded pipeline the LLM decides:

* what to ask for (maybe it calls count_nodes only; maybe it pulls
  a sample via list_nodes; maybe it skips both and asks for the
  operator's focus country),
* how to summarise (short 2-3 sentence Turkish brief),
* whether the state warrants a follow-up note (no nodes, only stale
  ones, cluster in one region, …).

It's the smoke-test target for the full LLM loop — running it
end-to-end proves:

  1. the framework reaches the Max bridge,
  2. Claude can drive tools via the ``<tool_call>``/``<final>``
     text protocol,
  3. results flow back into the timeline the UI renders.
"""
from __future__ import annotations

from ..llm import LlmAgent
from ..tools.inventory import CountNodesTool, ListNodesTool


_SYSTEM = """\
Rolün: bir operatörün envanter durumunu Türkçe 2-3 cümleyle özetleyen
kıdemli bir analist.

Talimat:
1) Önce ``count_nodes`` aracıyla toplam kaydı öğren.
2) Sayı > 0 ise ``list_nodes`` ile son birkaç girdiyi (limit 5) al;
   sayı 0 ise liste çağırma, doğrudan <final> üret.
3) <final> içinde ``summary`` kısa ve askeri-raporvari olsun; ek olarak
   ``total`` (int) ve ``recent`` (liste, sadece isimler) alanlarını ver.
4) Gereksiz tur atma: en fazla bir count + bir list + final.
"""


class LlmInventoryAnalyst(LlmAgent):
    name        = "llm_inventory_analyst"
    description = (
        "LLM destekli envanter özeti — Claude Max üzerinden "
        "count_nodes + list_nodes araçlarını çağırır."
    )
    tools         = [CountNodesTool(), ListNodesTool()]
    system_prompt = _SYSTEM
    # Three turns is enough for count → list → final. Give one extra
    # slot as breathing room for the LLM to retry on a malformed turn.
    max_iterations = 4
