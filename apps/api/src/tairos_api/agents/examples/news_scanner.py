"""NewsScanner — scan a feed, deepen into one article, brief.

Flow the LLM follows:

  1. ``rss_fetch`` the source the operator named (URL in prompt, or a
     ``feed_url`` entry in ``Bağlam:``). Pull up to 10 items.
  2. Pick the item most relevant to the operator's focus (the prompt
     + any ``focus_country`` in context). If nothing is relevant, say
     so in the final and bail.
  3. ``web_fetch`` the most relevant item's link to read deeper than
     the feed summary usually allows.
  4. Produce a Turkish Sentinel-style brifing: 1-2 sentences +
     ``headlines`` (last 3-5 titles seen) + ``bullets`` (what an
     operator should actually know).

Why give the LLM both tools?
---------------------------
Feed summaries are often one sentence. Operators don't want "XYZ
reported tensions rose" — they want the *what*, *where*, *when*. The
deep-fetch step costs ~1 extra LLM turn but produces dramatically
better briefs. The max_iterations cap keeps the worst-case turns
bounded so a looping agent doesn't run away.
"""
from __future__ import annotations

from ..llm import LlmAgent
from ..tools.rss import RssFetchTool
from ..tools.web import WebFetchTool


_SYSTEM = """\
Rolün: bir haber kaynağındaki (RSS / Atom) son haberleri tarayıp
operatör için Türkçe, askeri-istihbarat tonunda kısa bir brifing
üreten istihbarat analisti.

Talimat:
1) Operatörün isteğinde bir feed URL'si varsa onu kullan. Yoksa
   ``Bağlam:`` içindeki ``feed_url`` alanına bak. Hiçbiri yoksa araç
   çağırma; doğrudan <final> ile "kaynak verilmedi" notunu dön.
2) Önce ``rss_fetch`` ile son 10 başlığı al.
3) Başlıkları tara; operatörün ilgi alanı (istek metni + bağlamdaki
   ``focus_country``) ile en alakalı **bir** haberi seç.
4) Seçilen haberin ``link`` değerini ``web_fetch`` ile çek (HTML
   sayfası → düz metin). Kısa bir sayfaysa yetin, gerektiğinde
   max_chars'ı yüksek tut (ör. 6000).
5) Eğer feed boşsa ya da hiçbir başlık alakalı değilse, <final>
   ile durumu özetle; spekülatif içerik üretme.
6) <final> içinde şu alanları mutlaka doldur:
     - ``summary`` (string): 1-2 cümle, Türkçe, askeri ton.
     - ``headlines`` (liste, string[]): son 3-5 başlık (feed
       sırasıyla, seçilen ilk sırada olsun).
     - ``bullets`` (liste, string[]): 2-5 operasyonel çıkarım —
       yalnızca kaynaktaki bilgilere dayan, tahmin ekleme.
     - ``source`` (string): ``web_fetch`` ile çekilen final URL
       (redirect sonrası).
7) Toplam araç çağrısı en fazla 2: bir rss + bir web. Daha fazla
   isteme; eksik veri varsa <final>'de açıkça söyle.
"""


class NewsScanner(LlmAgent):
    name        = "news_scanner"
    description = (
        "Bir RSS/Atom feed'inden son başlıkları alır, en alakalı "
        "habere derinlemesine bakıp Türkçe brifing üretir."
    )
    tools         = [RssFetchTool(), WebFetchTool()]
    system_prompt = _SYSTEM
    # rss + web + final + one nudge slot = 4.
    max_iterations = 4
