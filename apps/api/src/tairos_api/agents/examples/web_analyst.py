"""WebAnalyst — LLM agent that reads a URL and produces a briefing.

Use case: the operator drops a news / analysis URL into the prompt and
wants a Turkish one-paragraph summary written in a Sentinel-style tone,
plus a short bullet list of operational takeaways. The agent reaches
for ``web_fetch`` once, parses whatever plain-text body comes back, and
writes the summary.

Why a single-tool agent rather than a sprawl?
---------------------------------------------
This is the pilot for "LLM + external data". Keeping the toolbox to
one verb (fetch URL) makes the failure modes small and legible — if
the summary is off, the only variables are (a) the URL's quality and
(b) the LLM's interpretation. When we add RSS / search later, those
live behind their own agents (or this one grows a sibling) so each
agent's prompt stays tight.

The prompt nudges the LLM toward a *specific* output shape so the
panel's ``ResultBlock`` renders it cleanly without a custom formatter
per agent: ``summary`` + ``bullets`` (list of strings) + ``source``.
"""
from __future__ import annotations

from ..llm import LlmAgent
from ..tools.web import WebFetchTool


_SYSTEM = """\
Rolün: verilen URL'den metni okuyup Türkçe, askeri-istihbarat üslubunda
kısa brifing hazırlayan bir analist.

Talimat:
1) İsteğin içinde bir URL geçiyorsa, önce ``web_fetch`` aracıyla o
   sayfayı getir. Birden fazla URL varsa yalnızca ilkini al.
2) İsteğin içinde hiç URL yoksa, çağrı yapma — doğrudan ``<final>``
   ile operatöre "URL verilmedi" notunu dön.
3) ``web_fetch`` hata dönerse (``private/loopback``, ``timeout``,
   ``cannot resolve``), ``<final>`` ile durumu özetle; ikinci kez
   çağırma.
4) Başarılı fetch sonrası ``<final>`` üret. Şu alanları mutlaka doldur:
     - ``summary`` (string): 1-3 cümle, Türkçe, askeri ton.
     - ``bullets`` (liste, her biri kısa string): 2-5 adet operasyonel
       çıkarım. Sayfadan çıkmayan spekülasyona girme.
     - ``source``  (string): web_fetch'in döndürdüğü final URL.
5) Sayfa çok kısaysa veya alakasızsa bunu summary'de açıkça belirt;
   bullets'ı doldurmak için varsayım üretme.
"""


class WebAnalyst(LlmAgent):
    name        = "web_analyst"
    description = (
        "Verilen URL'yi çeker ve Türkçe brifing üretir — "
        "haber / analiz sayfalarını hızla özetlemek için."
    )
    tools         = [WebFetchTool()]
    system_prompt = _SYSTEM
    # One fetch + one final = 2 turns; give one slot of breathing room
    # for a malformed-reply nudge. No reason to let it loop further.
    max_iterations = 3
