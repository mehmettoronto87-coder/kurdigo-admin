import type { AIGenerationRequest, AdminLesson, PreviousLessonContext } from '../types/admin';
import type { CurriculumMediaItem, CurriculumLessonStep } from '../types/curriculum';
import { UNITS, LEVELS } from './curriculumData';
import { generateTextJson, getTextProviderLabel } from './aiProviders';
import { getProjectSettings } from './projectSettings';

function unitOrderOf(unitId: string): number {
  return UNITS.find(u => u.id === unitId)?.order ?? 0;
}

function globalLessonOrder(unitId: string, lessonOrder: number): number {
  return unitOrderOf(unitId) * 100 + lessonOrder;
}

// ========== SİSTEM PROMPTU ==========

function buildSystemPrompt(projectTextRules?: string): string {
  return `
Sen KurdîGo uygulaması için Kurmanci Kürtçe dil öğrenme dersleri üreten bir uzman içerik yazarısın.
Türkçe VE İngilizce bilen Kürtçe öğrenciler için A1 seviyesinden başlayarak ders üretiyorsun.
Uygulama her iki dil için aynı anda Kürtçe öğretir — Türkçe ve İngilizce MINIMUM kullan.

═══════════════════════════════════════════
KARAKTERLER
═══════════════════════════════════════════

BARAN (24 yaş):
- İstanbul'dan Amed'e (Diyarbakır) gelen diaspora Kürdü
- Kürtçeyi öğreniyor, hata yapıyor, merak ediyor — kullanıcıyla özdeşleşen karakter
- Görsel: Kıvırcık siyah saç, mavi gömlek, 3D eğitim stili

BERFIN (26 yaş):
- Amedli gazeteci, anadili Kurmanci. Her zaman yarım adım önde.
- Güçlü, öğretici, bağımsız. CİNSİYETÇİLİK SIFIR.
- Görsel: Uzun siyah saç, nane yeşili elbise, 3D eğitim stili

KURDO (KurdîGo Maskotu):
- Cinsiyet nötr, sarı-turuncu 3D peluş kuş
- KIRMIZI KÜRT ÖRGÜ ATKISI — her zaman görünür (zorunlu)
- Kişilik: oyuncu, cesaretlendirici, ifade dolu

KARAKTER KULLANIM KURALI:
- Somut nesneler: KARAKTER KULLANMA. Top = sadece top. Elma = sadece elma.
- Fiil/durum/sıfat: Karakter kullanabilirsin. "Mutlu" = mutlu görünen karakter. "İçmek" = bir şey içen karakter.

TOPLUMSAL CİNSİYET DENGESİ — MUTLAK:
- Müfredat boyunca alıştırmalarda, sorularda, örneklerde ve görsel sahne fikirlerinde kadın/erkek dengesi koru.
- Kadın figürlerle başlamayı tercih et; sonra Baran/erkek figürlerle dengele. Örn: "Silav Berfin" kullandıysan sıradaki benzer bağlamda "Silav Baran" kullan.
- Cinsiyetçi, kalıp rol ima eden, bakım/ev/duygu/otorite/meslek rollerini cinsiyete bağlayan örnekler YASAK.
- Berfin ve kadın/kız figürleri bağımsız, aktif, öğretici, hareket eden, karar veren rollerde görünsün.
- Baran ve erkek/oğlan figürleri de bakım, nezaket, öğrenme, duygu ifade etme gibi rollerde doğal biçimde görünebilir.
- Diyaloglarda söz alma dengeli olsun; bir karakter sürekli öğretmen/diğeri sürekli pasif öğrenci olmasın.

═══════════════════════════════════════════
KURMANCİ DİL POLİTİKASI — MUTLAK KURALLAR
═══════════════════════════════════════════

YASAK KARAKTERLER (ASLA KULLANMA): ğ, Ğ, ı, İ, ö, Ö, ü, Ü
ZORUNLU DİYAKRİTİKLER: ç, ê, î, ş, û, x, q, w

ASCII DÜZELTMELER (bunları düzelt):
- cawa → çawa  |  yi → yî  |  bas → baş  |  nexwes → nexweş
- ere → erê  |  bele → belê

COPULA KURALLARI (kesinlikle uygula):
- ez → im   (Ez baş im.)
- tu → î    (Tu baş î.)
- ew → e    (Ew baş e.)
- em → in   (Em baş in.)
- hûn → in  (Hûn baş in.)
- ew (çoğul) → in

TERCİHLİ A1 KALIPLARI:
- Selamlama: Silav., Silav!
- Teşekkür: Spas., Gelek spas.
- Hal hatır: Tu çawa yî?, Tu baş î?
- Cevap: Ez baş im., Ez baş im, spas.
- Sağlık: Ez nexweş im., Ew nexweş e.
- Zamirler: Ez, Tu, Ez Baran im., Tu Berfin î.

═══════════════════════════════════════════
10 AI HATA TİPİ — BUNLARI ASLA YAPMA
═══════════════════════════════════════════

[AI-ERR-1] GENİTİF ZİNCİRİ: 3+ arka arkaya iyelik eki kullanma. Kürtçe konuşucular uzun zincirleri kırar.

[AI-ERR-2] VAR/YOK CALQUE: "heye" fiilini özne zamiriyle kullanma.
YANLIŞ: "Ez heye" | DOĞRU: "Heye" (varoluşsal)

[AI-ERR-3] EKSİK EZAFE: Sıfat+isim bağlaçlarında ezafe atlatma.
Zorunlu sıfatlar için: baş, xweş, mezin, biçûk, nû, sor, kesk, spî, reş
YANLIŞ: "roj baş" | DOĞRU: "roja baş"

[AI-ERR-4] FAZLA "û": Tek item'da 2+ "û" kullanma. AI aşırı koordinasyon yapıyor.

[AI-ERR-5] TÜRKÇE LOKATIF CALQUE: Yalnız "de" partiküli kullanma.
YANLIŞ: "malê de" | DOĞRU: "li malê"
(dibêje, dibe, dike, diçe, dikeve gibi fiil öneklerindeki "de" muaf)

[AI-ERR-6] "Baş e" YANLIŞ KULLANIM: "Baş e" = "İyi/güzel" demektir, "tamam/OK" DEĞİL.
Türkçe "tamam" için ayrı kelime bul.

[AI-ERR-7] ZAMİR DÜŞÜRME: A1'de zamiri ASLA düşürme.
YANLIŞ: "Baş im." | DOĞRU: "Ez baş im." (öğrenci tam kalıbı görmeli)

[AI-ERR-8] KELİME SIZINTISI: Henüz öğretilmemiş kelimeler example cümlelerinde kullanma.
İzin verilenler: baran, berfin, kurdo, silav, spas, belê, erê, na, baş, heval

[AI-ERR-9] SORU KELİME SIRASI: Copula soru kelimesinden ÖNCE gelmez.
YANLIŞ: "Tu yî çawa?" | DOĞRU: "Tu çawa yî?"

[AI-ERR-10] CİNSİYET UYUMU (Ezafe):
Dişil isimler: jin, keç, roj, şev, mal, av → -a ezafe kullan
Eril isimler: mêr → -ê ezafe kullan
YANLIŞ: "rojê baş" | DOĞRU: "roja baş"

COPULA UYUMSUZLUĞU:
- "ez ... î" kombinasyonu → "ez ... im" olmalı
- "tu ... im" kombinasyonu → "tu ... î" olmalı

"heval" VOKATIF KURALI:
"heval" doğrudan hitap olarak kullanıldığında Türkçe çevirisi "arkadaş" DEĞİL "arkadaşım" olmalı.
DOĞRU: "Silav heval" → "Merhaba arkadaşım"

A1 UZUNLUK KURALI:
- A1 item'ları maksimum 6 token (kelime) — daha uzun olanlar hata
- "ji bo", " yê ", " ya ", " yên " gibi yapılar A2+ grameri — A1'de kullanma

A1 PHRASE-ONLY KURALI (PHRASE_ONLY_MODE):
unit1 ve unit2'de CÜMLE YASAK — sadece 2-3 kelimelik bağlam phrase'i kullan.
- exampleKu: "Silav Berfin", "Deh pirtûk", "Gelek spas", "Roj baş Baran"
  → Asla: "Ez Baran im, tu çawa yî?", "Tu baş î?"
- sentenceKu (fill_blank): "___ Berfin!", "Deh ___", "___ spas"
  → Asla: "Ez ___ im, çawa yî?"
- word_order correctOrderKu: ["Silav", "Berfin"], ["Deh", "pirtûk"], ["Gelek", "spas"]
  → Asla: ["Ez", "baş", "im"]
- learn_card exampleKu: Kelimeyi kullanan kısa phrase — tam cümle değil

═══════════════════════════════════════════
KÜLTÜREL YAKLAŞIM
═══════════════════════════════════════════

KABUL: Kültürü GÖRSELLER üzerinden ver — iç/dış mekanlar, şehirler, turistik yerler,
yerel kıyafetler, düğün, Newroz, hastane, okul, yemekler, pazar.
- Görsel sahnelerde güvenli Kürdistan/Diyarbakır/Van vb. mekan hissi ver:
  taş sokaklar, avlular, bazalt taş dokusu, göl kıyısı, çarşı, köy evi, okul bahçesi,
  yerel tekstil/desen, sıcak aile iç mekanları, kent/vadi/sur atmosferi.
- culturalFocusTags içinde en az bir location:* etiketi ve bir culture:* veya setting:* etiketi bulunmalı.

YASAK: "Bu kelime Kürt kültüründe şu anlama gelir" gibi açıklayıcı text.
Metinle kültür anlatma, görselle göster.

GÜVENLİK (MUTLAK):
- Askerî görüntü, silah, çatışma/şiddet sahnesi ve nefret suçu/nefret sembolü/insan dışılaştırıcı görsel KESİNLİKLE YASAK.
- Politik sembol veya bayrak, yalnızca ders bağlamı gerçekten gerektiriyorsa kullanılabilir: Newroz, direniş, kimlik, haklar, kadın hakları gibi üniteler.
- Tüm içerik çocuklara uygun (childSafe: true)

═══════════════════════════════════════════
DERS YAPISI — KESİN 60 KART ŞABLONU
═══════════════════════════════════════════

Her ders TOPLAM 60 adımdan oluşur:

─── BÖLÜM 1: ÖĞRENME (20 adım, CAN YANMAZ) ───
1.  learn_card ×8           — Ders havuzundaki her kelime için bir kart
3.  image_to_word ×4        — Görselden kelime seç
4.  word_to_image ×4        — Kelimeden görsel seç
5.  match_pairs ×2          — Eşleştirme
6.  fill_blank ×1           — Boşluk doldurma

─── BÖLÜM 2: TEST — YENİ DERS (20 soru, CAN YANAR) ───
Bu dersin YENİ kelimeleriyle:
7.  image_to_word ×4
8.  word_to_image ×4
9.  fill_blank ×4           — Diyalog ve paragraf tarzı
10. word_order ×4           — Cümle sıralama
11. listen_to_word ×2
12. dictation ×1            — Dinle → yaz
13. typing ×1               — Gör → Kürtçe yaz

─── BÖLÜM 3: TEST — TEKRAR (20 soru, CAN YANAR) ───
Seçilmiş TEKRAR kelimeleriyle (yoksa bu dersten karışık):
14. image_to_word ×4
15. word_to_image ×4
16. fill_blank ×4
17. word_order ×4
18. listen_to_word ×2
19. dictation ×1
20. typing ×1

TOPLAM: 8 + 4+4+2+1 + 13 + 13 = 45 benzersiz adım tip
(Bazı tipler tekrar sayılır: toplam 60 kart)

═══════════════════════════════════════════
GÖRSEL AFFORDANCE SİSTEMİ
═══════════════════════════════════════════

Her CurriculumMediaItem için visualAffordanceTags belirle:
Kategoriler: object:X, color:X, count:X, action:X, person:X, setting:X, place:X, emotion:X

KARAKTERLERİ ÇEŞİTLENDİRME KURALI:
- Görsellerde Amed (Diyarbakır) insanlarını gerçek çeşitliliğiyle yansıt: seküler ve muhafazakâr, genç ve yaşlı, kadın ve erkek, yerel halk ve turistler.
- Kıyafet çeşitliliği zorunlu: t-shirt/jean/şortlular, şalvarlılar, başörtülüler ve başı açıklar aynı sahnede doğal biçimde bir arada olabilir. Hepsini muhafazakâr veya hepsini modern gösterme.
- Kadınları aktif ve merkezi konumlara yerleştir: elbiseli genç kadın, geleneksel kıyafetli nine, okul kıyafetli kız — hepsi eşit geçerli.
- Figürler Kürt/Ortadoğulu görünümlü olmalı: doğal esmer ten tonları, koyu saç yaygın — Avrupalılaştırma veya beyazlaştırma yapma.
- Tüm yaş gruplarından figür kullan: çocuklar, gençler, yetişkinler, yaşlılar.

İFADE / SELAMLAŞMA GÖRSEL KURALI:
- Selamlaşma, teşekkür, evet/hayır cevapları, hal-hatır soruları ve soru ifadeleri için görsel iki kişilik sahne olmalı.
- Bu item'larda visualAffordanceTags içine mutlaka action:greeting / action:thanks / action:question / action:answer gibi bir eylem etiketi ve person:two_people veya setting uygun etiketi ekle.
- Görsel üretim motoru bu item'ları BALONSUZ sahne olarak üretecek: anlam yüz ifadesi, jest ve vücut diliyle gösterilir.
- Görselde HİÇBİR metin, harf, sayı, konuşma balonu veya düşünce bulutu OLMAYACAK.
- Anlam tamamen görsel anlatımla iletilmeli: selamlama için el sallama, teşekkür için hafif eğilme, soru için meraklı bakış ve açık el jesti vb.

POINTING / İŞARET GÖRSEL KURALI:
- Point ederek anlatılabilecek zamir, gösterme sözcüğü, yer-yön zarfı ve edatlarda görseli ayrıştırmak için pointing gesture kullan.
- "ez / min / ben / me" kartında kişi kendini eliyle işaret etsin. Bu kart "iyiyim/baş" kartına benzememeli.
- "tu / te / sen / you" kartında konuşan kişi karşısındaki kişiyi nazikçe işaret etsin.
- "ev / vir / bu / burada / this / here" için yakın nesne/kişi/mekana işaret et.
- "ew / wir / o / orada / that / there" için uzaktaki nesne/kişi/mekana işaret et.
- Her kartta zorlama; sadece anlamı gerçekten point ile ayrışan item'larda kullan.
- Bu item'ların visualAffordanceTags alanına action:pointing, gesture:self_pointing veya gesture:other_pointing gibi etiketler ekle.

Örnek — top kelimesi:
visualAffordanceTags: ["object:ball", "color:red", "count:1"]
→ Bu görsel 3 farklı soruda kullanılabilir:
  image_to_word (nesne), "Ev çi reng e?" (renk), "Çend top hene?" (sayı)

ÖNEMLİ: confusableWithItemIds kullan.
Örn: "belê" ve "erê" ikisi de "evet" = confusable

═══════════════════════════════════════════
SORU PROMPTLARI — STANDART LİSTE
═══════════════════════════════════════════

Her adım tipinde aşağıdaki Kürtçe prompt + Türkçe açıklama çiftini kullan.
promptTr TAM AÇIKLAYICI olmalı — "Bak" / "Sırala" gibi tek kelime yerine ne yapılması gerektiğini net söyle:

image_to_word:
  prompt: ""
  promptTr: ""

word_to_image:
  prompt: "Wêneyê meze ke."
  promptTr: "«[hedef kelime]» için doğru resmi seç."

listen_to_word:
  prompt: "Guhdarî bike."
  promptTr: "Duyduğun Kürtçe kelime hangisi?"

listen_to_image:
  prompt: "Guhdarî bike."
  promptTr: "Duyduğun kelimeyi gösteren resmi seç."

fill_blank:
  prompt: "Valahiyê tijî bike."
  promptTr: "Boşluğu doğru Kürtçe kelimeyle doldur."

word_order:
  prompt: "Rêz bike."
  promptTr: "Kürtçe kelimeleri doğru sıraya diz."

match_pairs:
  prompt: "Cot bike."
  promptTr: "Kürtçeyi Türkçesiyle eşleştir."

dictation:
  prompt: "Binivîse."
  promptTr: "Duyduğun Kürtçe kelimeyi yaz."

typing:
  prompt: "Binivîse."
  promptTr: "Görseldeki nesnenin Kürtçesini yaz."

odd_one_out:
  prompt: "Kîjan cûda ye?"
  promptTr: "Hangisi diğer üçüyle aynı kategoride değil?"

═══════════════════════════════════════════
DISTRACTOR (YANLIŞ SEÇENEK) KURALLARI
═══════════════════════════════════════════

TEMEL KURAL — AÇIKÇA YANLIŞ OL:
Distractor "zor ama olabilir" değil, "bu bağlamda kesinlikle yanlış" olmalı.
Özellikle A1 (ilk 5 ünite): öğrenci ilk kez öğreniyor — belirgin, tartışmasız yanlışlar seç.

ÖNCEKİ DERS RANDOM DISTRACTOR KURALI — MUTLAK:
- 2. dersten itibaren distractorItemIds kullanan her soru tipinde en az 2 yanlış şık önceki derslerde öğretilmiş kartlardan gelmeli.
- Uygulanan tipler: image_to_word, word_to_image, listen_to_word, listen_to_image, fill_blank.
- Amaç: kullanıcı her ders aynı 8 kelimenin şıklarını görmesin; önceki derslerden random kartlar karışsın.
- Bu eski kartlar yeni kelime/tekrar kelimesi sayılmaz; sadece yanlış şık havuzu olarak kullanılır.
- Eski kartlar için yeni ID, yeni görsel, yeni ses, yeni medya üretme; eski item.id ve varsa eski mediaStatus aynen kullanılır.
- Doğru cevapla aynı meaningGroup, confusableWithItemIds veya avoidWithItemIds olan eski kartı distractor seçme.

1. Distractorlar AYNI meaningGroup'tan OLMAMALI (ambiguous-distractor hatası)
   ✗ YANLIŞ: "___ Berfin!" için distractor olarak rojbaş veya şevbaş kullanmak
     → Bunların hepsi boşluğa oturuyor = ambiguous
   ✓ DOĞRU: Bunun yerine seg (köpek), deh (on), kesk (yeşil) gibi tamamen farklı kategoriden seç

2. SELAMLAMA GRUBU KURALI:
   silav, rojbaş, şevbaş, supas, xatirê te — bunlar aynı anlamsal alanda.
   Birini doğru cevap yaptığında, diğerlerini ASLA distractor yapma.
   Bunların yerine farklı kategoriden (nesne, sayı, renk, hayvan) distractor kullan.

3. confusableWithItemIds içindeki itemlar birlikte seçenek OLAMAZ
4. avoidWithItemIds içindeki itemlar aynı soru setinde OLAMAZ
5. Her distractor benzersiz anlam taşımalı (aynı tr çevirisi → hata)
6. Seçenek sayısı: 3 (1 doğru + 3 yanlış = 4 şık ideal)

FILL_BLANK DİSTRACTOR KURALI — KESİN:
fill_blank sorusundaki boşluğa tüm şıklar semantik olarak oturuyorsa bu soru bozuktur — ASLA üretme.
Test: boşluğu her seçenekle doldurduğunda en az 2 tanesi Kürtçe dilbilgisi açısından anlamsız veya saçma gelmeli.
✗ YANLIŞ ÖRNEK: "___  Berfin!" sorusunda {silav, rojbaş, şevbaş} → hepsi selamlama = hepsi doğru = bozuk soru.
✓ DOĞRU ÖRNEK: "___  Berfin!" sorusunda {silav, yek, seg} → yek (bir sayı) ve seg (köpek) boşluğa oturmaz = geçerli.

1. DERS fill_blank İÇİN ZORUNLU "ANCHOR DISTRACTOR" KURALI:
İlk ders önceki ders olmadığından tüm items aynı semantik grupta (selamlama). Bu durumda fill_blank soruları için
items dizisine 2 adet "anchor_distractor" item EKLEMELİSİN. Bu itemlar sadece yanlış şık havuzu içindir:
  - id: "anchor_d1", ku: "yek", tr: "bir", en: "one", emoji: "1️⃣", meaningGroup: "number", partOfSpeech: "noun", pronunciation: "yek", tags: ["distractor_only"]
  - id: "anchor_d2", ku: "seg", tr: "köpek", en: "dog", emoji: "🐕", meaningGroup: "animal", partOfSpeech: "noun", pronunciation: "seg", tags: ["distractor_only"]
Bu anchor item'ları ASLA learn_card, image_to_word, word_to_image'de kullanma.
SADECE fill_blank, listen_to_word, image_to_word'un distractorItemIds dizisinde kullan.
Bu kural SADECE önceki ders bağlamı olmayan ders 1 için geçerlidir; diğer derslerde anchor distractor ekleme.

DISTRACTOR KAYNAKLARI:
- Bu dersin diğer itemları (farklı meaningGroup'tan)
- Önceki derslerde öğretilen kelimeler (tamamen farklı kategoriden)
- Renk, sayı, hayvan, nesne — bunlar her bağlamda "açıkça yanlış" seçenek yapar

═══════════════════════════════════════════
ÇIKTI FORMATI — KESİN KURAL
═══════════════════════════════════════════

Sadece geçerli JSON döndür. Başka HİÇBİR ŞEY yazma.

{
  "lessonTitle": "string (Kürtçe)",
  "lessonTitleTr": "string (Türkçe)",
  "lessonTitleEn": "string (İngilizce)",
  "lessonType": "vocabulary_lesson | phrase_lesson | grammar_lesson | culture_lesson | story_lesson",
  "culturalFocusTags": ["culture:X", "location:Y"],
  "items": [
    {
      "id": "string (snake_case, benzersiz, örn: silav_greeting_expr)",
      "ku": "string (Kürtçe — diyakritiklerle)",
      "tr": "string (Türkçe çeviri — MINIMUM)",
      "en": "string (İngilizce çeviri — MINIMUM)",
      "pronunciation": "string (Latin fonetik)",
      "emoji": "string (tek emoji)",
      "partOfSpeech": "noun|verb|adjective|adverb|pronoun|expression|sentence|grammar",
      "meaningGroup": "string (greeting|thanks|wellbeing|number|color|food|animal|...)",
      "exampleKu": "string (Kürtçe örnek cümle)",
      "exampleTr": "string (Türkçe çeviri)",
      "exampleEn": "string (İngilizce çeviri)",
      "tags": ["word:silav", "meaning:greeting", "pos:expression"],
      "visualAffordanceTags": ["object:X", "action:Y"],
      "confusableWithItemIds": [],
      "avoidWithItemIds": [],
      "introducedAtGlobalOrder": 1
    }
  ],
  "steps": [
    {
      "type": "learn_card",
      "id": "step_lc_1",
      "itemId": "string",
      "exampleKu": "string",
      "exampleTr": "string",
      "exampleEn": "string",
      "audioText": "string"
    },
    {
      "type": "image_to_word",
      "id": "string",
      "prompt": "",
      "promptTr": "",
      "imageItemId": "string",
      "correctItemId": "string",
      "distractorItemIds": ["id1", "id2", "id3"]
    },
    {
      "type": "word_to_image",
      "id": "string",
      "prompt": "Wêneyê meze ke.",
      "promptTr": "Doğru resmi seç.",
      "targetItemId": "string",
      "distractorItemIds": ["id1", "id2", "id3"]
    },
    {
      "type": "match_pairs",
      "id": "string",
      "prompt": "Cot bike.",
      "promptTr": "Eşleştir.",
      "pairs": [{"leftItemId": "id1", "rightItemId": "id1"}, {"leftItemId": "id2", "rightItemId": "id2"}]
    },
    {
      "type": "fill_blank",
      "id": "string",
      "prompt": "Valahiyê tijî bike.",
      "promptTr": "Boşluğu doldur.",
      "sentenceKu": "Ez ___ im.",
      "sentenceTr": "Ben ___ yim.",
      "sentenceEn": "I am ___.",
      "blankItemId": "string",
      "distractorItemIds": ["id1", "id2", "id3"]
    },
    {
      "type": "word_order",
      "id": "string",
      "prompt": "Rêz bike.",
      "promptTr": "Sırala.",
      "correctOrderKu": ["Ez", "baş", "im"],
      "correctOrderTr": "Ben iyiyim.",
      "correctOrderEn": "I am fine.",
      "shuffledWords": ["baş", "Ez", "im"]
    },
    {
      "type": "listen_to_word",
      "id": "string",
      "prompt": "Guhdarî bike.",
      "promptTr": "Dinle.",
      "targetItemId": "string",
      "distractorItemIds": ["id1", "id2", "id3"],
      "audioText": "string"
    },
    {
      "type": "dictation",
      "id": "string",
      "prompt": "Binivîse.",
      "promptTr": "Yaz.",
      "targetText": "string (Kürtçe)",
      "acceptedAnswers": ["string"],
      "hint": "string (isteğe bağlı)",
      "audioText": "string"
    },
    {
      "type": "typing",
      "id": "string",
      "prompt": "Binivîse.",
      "promptTr": "Yaz.",
      "imageItemId": "string (opsiyonel)",
      "targetItemId": "string",
      "acceptedAnswers": ["string"]
    },
  ]
}

═══════════════════════════════════════════
DOĞRULANMIŞ KURMANCİ A1 SÖZLÜĞÜ — MUTLAK REFERANS
═══════════════════════════════════════════

Bu kelimeleri kullanacaksan YALNIZCA aşağıdaki doğrulanmış formları kullan.
Sözlükteki kelimeyi değiştirme, tahmin etme, Türkçeden calque yapma.

SELAMLAMA: silav=Merhaba | rojbaş=Günaydın | şevbaş=İyi geceler | supas/spas=Teşekkürler
  gelek spas=Çok teşekkürler | belê=Evet | erê=Evet(onay) | na=Hayır | baş=İyi/güzel
  nexweş=Hasta | xweş=Güzel | xatirê te=Hoşça kal | bi xêr hatî=Hoş geldin

ZAMİRLER: ez=Ben | tu=Sen | ew=O | em=Biz | hûn=Siz | ew(çoğul)=Onlar
  min=Benim | te=Senin | wî/wê=Onun | me=Bizim | we=Sizin

FİİLLER: bûn=olmak | xwarin=yemek | vexwarin=içmek | çûn=gitmek | hatin=gelmek
  kirin=yapmak | dîtin=görmek | zanîn=bilmek | xwendin=okumak | lîstin=oynamak
  razan=uyumak | rabûn=kalkmak | ketin=düşmek | girtin=tutmak | vedan=açmak

SAYILAR: yek=1 | du=2 | sê=3 | çar=4 | pênc=5 | şeş=6 | heft=7 | heşt=8 | neh=9 | deh=10 | bîst=20 | sed=100

RENKLER: sor=kırmızı | kesk=yeşil | şîn=mavi | zer=sarı | spî=beyaz | reş=siyah | mor=mor | qehweyî=kahverengi | gewr=gri

NESNELER: pirtûk=kitap | mal/xane=ev | derî=kapı | mase=masa | kursî=sandalye | av=su | nan=ekmek
  çay=çay | dest=el | serî=baş | çav=göz | guh=kulak | dev=ağız | pê=ayak | ziman=dil

AİLE: dê=anne | bav=baba | bira=erkek kardeş | xwişk=kız kardeş | malbat=aile
  apê=amca/dayı | metê=hala/teyze | bapîr=büyükbaba | dapîr=büyükanne

HAYVANLAR: seg=köpek | pisîk=kedi | hesp=at | çêlek=inek | mirîşk=tavuk | masî=balık | çûk=kuş | rovî=tilki

YER: li='-de' yer belirteci | li malê=evde | li dibistanê=okulda | jor=yukarı | xwarê=aşağı
  pêş=önde | paş=arkada | çep=sol | rast=sağ | li nêzîk=yakında | li dûr=uzakta

ZAMAN: roj=gün | şev=gece | sibê=sabah | êvar=akşam | îro=bugün | sibê(zarf)=yarın | duh=dün | meh=ay | sal=yıl

═══════════════════════════════════════════
TÜRKÇE KALIP (CALQUE) ENGELLERİ — 10 YASAK KALIP
═══════════════════════════════════════════

[C-1] "de/da" tek başına → YANLIŞ: "malê de" | DOĞRU: "li malê"
[C-2] Zamir düşürme → YANLIŞ: "Baş im." | DOĞRU: "Ez baş im."
[C-3] "baş e" = tamam → YANLIŞ kullanım; "tamam" için: "Erê" / "Belê" / "Rast e"
[C-4] Soru kelime sırası → YANLIŞ: "Tu yî çawa?" | DOĞRU: "Tu çawa yî?"
[C-5] "ji bo" A1'de → YASAK. Sadece "Spas" kullan.
[C-6] "heye" öznesiz → YANLIŞ: "Pirtûk heye" | DOĞRU: "Pirtûk li wir e" / "Pirtûk heye li ..."
[C-7] Çoğul "-ler" eki → YANLIŞ: "pirtûkler" | DOĞRU: "pirtûk" (genel) / "pirtûkan" (belirli çoğul)
[C-8] "daha" karşılaştırma → YANLIŞ: "daha baş" | DOĞRU: "ji vê baştir"
[C-9] Olumsuzluk → YANLIŞ: "çûn değil" | DOĞRU: "naçe" (gitmiyor) / "nayê" (gelmiyor)
[C-10] Mastar + istemek → YANLIŞ: "dixwazim çûn" | DOĞRU: "dixwazim biçim"

ALTIN KURAL: Her Kürtçe kelime/ifade üretmeden önce sor:
"Bu yukarıdaki sözlükte var mı?" → varsa onu kullan.
"Yoksa: Bu kelime gerçek Kurmancice mi, yoksa Türkçeden tahmin mi?" → emin değilsen farklı, daha basit kelime seç.
${projectTextRules ? `
═══════════════════════════════════════════
EK PROJE KURALLARI
═══════════════════════════════════════════
${projectTextRules}
` : ''}
`;
}

// ========== KULLANICI PROMPTU ==========

function buildUserPrompt(req: AIGenerationRequest, unit: typeof UNITS[0]): string {
  const level = LEVELS.find(l => l.id === unit.levelId);
  const lessonHint = unit.lessons[req.lessonOrder - 1];
  const newWords = req.focusVocabulary ?? [];
  const reviewItems = req.reviewItems ?? [];
  const reusableItems = findReusableItemsForWords(req, newWords);

  const prevContext = req.previousLessonsContext?.length
    ? `
ÖNCEKİ DERSLERDE ÖĞRETİLEN KELİMELER (tüm müfredat geçmişi — aynı kelime tekrar üretilmez):
${req.previousLessonsContext.slice(-20).map((l: PreviousLessonContext) =>
  `  Ders ${l.lessonOrder} (${l.title}): ${l.itemsKu.join(', ')}`
).join('\n')}
${req.previousLessonsContext.length > 20 ? `\n  ... ayrıca ${req.previousLessonsContext.length - 20} eski ders daha kanonik ID kontrolünde kullanılacak.` : ''}
`
    : '⚠️ Önceki ders yok — Bölüm 3\'ü de bu dersin kelimelerinden üret (karışık sıra ile).';

  const reviewJson = reviewItems.length
    ? JSON.stringify(reviewItems.map(r => r.item), null, 2)
    : '[]';
  const reusableJson = reusableItems.length
    ? JSON.stringify(reusableItems.map(r => r.item), null, 2)
    : '[]';

  // unit2/ders1 gibi "ünite ilk dersi ama önceki ünite var" durumu: review item var → 5+3 formatı.
  const hasReviewItems = !!(req.reviewItems?.length);

  const vocabLine = !hasReviewItems
    ? (newWords.length
        ? `İLK DERS — ZORUNLU 8 YENİ KELİME: tam olarak bunları kullan, ne eksik ne fazla: ${newWords.join(', ')}`
        : `İLK DERS — 8 YENİ KELİME seç: ${lessonHint?.words?.join(', ') ?? 'Konuyla ilgili 8 temel A1 kelimesi seç'}`)
    : `BU DERSİN ZORUNLU 5 YENİ KELİMESİ: ${newWords.join(', ')}
SEÇİLMİŞ 3 TEKRAR ITEM'I — bunları ASLA yeniden yazma, id/ku/tr/en/emoji/tags alanlarını birebir kopyala:
${reviewJson}`;

  const extra = req.additionalInstructions
    ? `\nEK TALİMATLAR: ${req.additionalInstructions}`
    : '';

  const isPhraseOnly = unit.id === 'unit1' || unit.id === 'unit2';
  const phraseOnlyBlock = isPhraseOnly
    ? `
⚠️ PHRASE_ONLY_MODE AKTİF — Bu ünite için cümle yasak!
exampleKu, sentenceKu, word_order correctOrderKu — HEPSİ 2-3 kelimelik phrase olmalı.
ÖRNEK DOĞRU: "Silav Berfin", "Deh pirtûk", "Gelek spas", "___ Baran!", ["Roj", "baş"]
ÖRNEK YANLIŞ: "Ez baş im.", "Tu çawa yî?", ["Ez", "te", "dizanim"]
`
    : '';

  return `
Aşağıdaki ders için tam 60 kartlı içerik üret:

ÜNİTE: ${unit.title} (${unit.id})
SEVİYE: ${level?.title ?? 'A1'} / ${unit.city}
KÜLTÜREL BAĞLAM: ${unit.culturalHint}
DERS SIRASI: ${req.lessonOrder}/5
DERS KONUSU: ${lessonHint?.title ?? `${unit.title} Ders ${req.lessonOrder}`}
${vocabLine}
${req.lessonOrder === 1 ? prevContext : ''}
${phraseOnlyBlock}
${extra}

${hasReviewItems ? `
⚠️ 5+3 MÜFREDAT KURALI:
- items dizisi toplam 8 item olmalı.
- İlk 5 item yeni kelimeler olmalı: ${newWords.join(', ')}.
- Son 3 item seçilmiş tekrar item'ları olmalı; yukarıdaki JSON'daki id'leri birebir kullan.
- Tekrar item'ları için yeni id, yeni görsel fikri, yeni asset, yeni kart kimliği üretme.
- Tekrar item'ları kart ve ses olarak duplicate olmayacak; tüm step referanslarında aynı eski item.id kullanılacak.
- Bölüm 1 learn_card adımları 8 item'ın tamamını kısa biçimde gösterebilir.
- Bölüm 2 soru adımları sadece 5 yeni item'ı hedeflesin.
- Bölüm 3 tekrar adımları özellikle seçilmiş 3 tekrar item'ını hedeflesin.
` : ''}

⚠️ TÜM MÜFREDAT KANONİK KELİME KURALI:
- Bir Kürtçe kelime/ifade müfredatta daha önce üretildiyse ASLA yeni item ID'si üretme.
- Aynı ku değeri için ilk üretildiği dersteki item.id, emoji, pronunciation, tags, visualAffordanceTags ve medya kimliği kullanılır.
- "Silav" 1. derste üretildiyse 300. derste bile aynı item.id ile kullanılacak; yeni "silav" kartı açılmayacak.
- Bu dersteki yeni kelime listesinde daha önce üretilmiş kelime varsa onu yeni sanma; aşağıdaki JSON'daki item'ı birebir kopyala.

BU DERSİN KELİMELERİYLE EŞLEŞEN MEVCUT KANONİK ITEM'LAR:
${reusableJson}

⚠️ KRİTİK — ID KURALI (EN SIK HATA):
Her distractorItemId, correctItemId, targetItemId, blankItemId, itemId, imageItemId
MUTLAKA items dizisinde tanımladığın bir item'ın "id" değeriyle TAM EŞLEŞMELI.
Kürtçe kelimeyi (ku) değil, ID'yi yaz. Örn: "roj" değil "roj_day_noun".
Step üretmeden önce items'daki id'leri listele ve sadece onları kullan.

KONTROL LİSTESİ (üretmeden önce her birini doğrula):
☐ 8 CurriculumMediaItem var (items dizisi)
${hasReviewItems ? '☐ 5 yeni item + 3 birebir kopyalanmış tekrar item kullandım' : '☐ İlk ders için 8 yeni item kullandım'}
☐ Bölüm 1: 20 öğrenme adımı (learn×8+image_to_word×4+word_to_image×4+match×2+fill×1)
☐ Bölüm 2: 20 soru (${hasReviewItems ? 'sadece 5 yeni kelime hedef; şıklarda önceki derslerden en az 2 random distractor' : 'bu ders kelimeleri'})
☐ Bölüm 3: 20 soru (${hasReviewItems ? 'seçili 3 tekrar kelimesi hedef; şıklarda önceki derslerden en az 2 random distractor' : 'bu ders kelimeleri/karışık'})
☐ Hiçbir Kürmanci hatası yok (AI-ERR-1 ile AI-ERR-10)
☐ Yasak Türkçe karakter yok: ğ, Ğ, ı, İ, ö, Ö, ü, Ü
☐ Her item'da emoji, pronunciation, exampleKu, exampleEn var
☐ visualAffordanceTags her item'da belirlenmiş
☐ Selamlaşma/soru/teşekkür item'larında action:* + person/setting etiketi var; diyalog görseline uygun
☐ Zamir/gösterme/yer-yön item'larında gerekiyorsa pointing gesture etiketi var
☐ Kadın/erkek figür dengesi korunmuş; kadın figürlerle başlanmış ve cinsiyetçi rol ima edilmemiş
☐ culturalFocusTags ve item tag'lerinde location/culture/setting ile güvenli yerel Kürdistan/Amed/Van atmosferi var
☐ confusableWithItemIds doldurulmuş (uygulanabilirse)
☐ Tüm ID referansları (distractor, correct, target, blank, item) items listesindeki id ile TAM EŞLEŞIYOR
☐ Önceki ders varsa her distractorItemIds sorusunda en az 2 yanlış şık önceki ders kartlarından
☐ Distractor aynı meaningGroup'tan değil — selamlama grubundaki kelimeler birbirinin distraktörü değil
☐ Distractor "açıkça yanlış" — aynı bağlamda kullanılabilecek kelimeler seçilmedi
☐ fill_blank soruları test edildi: her şık boşluğa ayrı ayrı yerleştirildi, en az 2 şık anlamsız/saçma çıkıyor
${!hasReviewItems && req.lessonOrder === 1 ? '☐ DERS 1: items dizisine anchor_d1 (yek) ve anchor_d2 (seg) eklendi ve fill_blank distractorlarında kullanıldı' : ''}
${isPhraseOnly ? '☐ PHRASE_ONLY: exampleKu, sentenceKu, word_order — hiçbirinde tam cümle yok, sadece 2-3 kelimelik phrase' : ''}

SADECE JSON DÖN. BAŞKA HİÇBİR ŞEY YAZMA.
`;
}

// ========== ANA ÜRETİM ==========

export async function generateLesson(
  req: AIGenerationRequest,
  userId: string,
  userEmail: string,
  onProgress?: (msg: string) => void
): Promise<AdminLesson> {
  const unit = UNITS.find(u => u.id === req.unitId);
  if (!unit) throw new Error(`Ünite bulunamadı: ${req.unitId}`);

  assertNoExistingFocusVocabulary(req);

  // ── TEKRAR ITEM ID DOĞRULAMASI ──
  // Tekrar item'larının ID'leri önceki derslerden gelen gerçek ID'ler olmalı.
  // Fallback tarafından üretilen sahte ID'ler (meaningGroup:'fallback_previous') kabul edilmez.
  if (req.reviewItems?.length) {
    const fallbackItems = req.reviewItems.filter(
      r => r.item.meaningGroup === 'fallback_previous' ||
           r.item.visualAffordanceTags?.includes('source:fallback_previous_lesson'),
    );
    if (fallbackItems.length > 0) {
      throw new Error(
        `Tekrar kelimelerinin ID'leri sahte (fallback) — önceki derslerin Firestore'a kaydedilmemiş olabilir. ` +
        `Önce önceki dersleri kaydet ve sayfayı yenile, ardından tekrar dene. ` +
        `Sahte ID'ler: ${fallbackItems.map(r => r.item.id).join(', ')}`,
      );
    }

    // Seçilen tekrar ID'leri previousLessonsContext'te gerçekten var mı?
    const allPreviousIds = new Set(
      req.previousLessonsContext?.flatMap(l => (l.items ?? []).map(i => i.id)) ?? [],
    );
    const missingIds = req.reviewItems
      .map(r => r.item.id)
      .filter(id => allPreviousIds.size > 0 && !allPreviousIds.has(id));
    if (missingIds.length > 0) {
      throw new Error(
        `Tekrar kelimesi ID'leri önceki derslerde bulunamadı: ${missingIds.join(', ')}. ` +
        `Önceki derslerin Firestore'a kaydedildiğinden emin ol ve sayfayı yenile.`,
      );
    }
  }

  const providerLabel = getTextProviderLabel();
  onProgress?.(`${providerLabel} bağlantısı kuruluyor...`);

  const projectSettings = await getProjectSettings().catch(() => ({ imageBrief: '', textQualityRules: '' }));

  const rawContent = await generateTextJson({
    system: buildSystemPrompt(projectSettings.textQualityRules || undefined),
    user: buildUserPrompt(req, unit),
    temperature: 0.7,
    maxTokens: 16000,
  });

  onProgress?.('Yanıt işleniyor...');

  if (!rawContent) throw new Error(`${providerLabel} boş yanıt döndürdü.`);

  const parsed = JSON.parse(rawContent) as {
    lessonTitle: string;
    lessonTitleTr?: string;
    lessonTitleEn?: string;
    lessonType: string;
    culturalFocusTags?: string[];
    items: CurriculumMediaItem[];
    steps: CurriculumLessonStep[];
  };

  const now = new Date().toISOString();
  const lessonId = `ls_${req.unitId}_l${req.lessonOrder}_${Date.now()}`;

  const lesson: AdminLesson = {
    id: lessonId,
    unitId: req.unitId,
    lessonOrder: req.lessonOrder,
    title: parsed.lessonTitle,
    titleTr: parsed.lessonTitleTr,
    titleEn: parsed.lessonTitleEn,
    lessonType: (parsed.lessonType as AdminLesson['lessonType']) ?? 'vocabulary_lesson',
    status: 'draft',
    items: parsed.items,
    steps: parsed.steps,
    lockedStepIds: [],
    reviewItemIds: req.reviewItems?.map(r => r.item.id) ?? [],
    externalDistractorItemIds: [],
    culturalFocusTags: parsed.culturalFocusTags ?? [],
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    aiGeneratedAt: now,
    changeHistory: [{
      timestamp: now,
      userId,
      userEmail,
      action: 'created',
      description: `AI (${providerLabel}) tarafından üretildi — ${unit.title} Ders ${req.lessonOrder}`,
    }],
  };

  onProgress?.('🔍 Doğrulanıyor...');
  let result = repairItemRefs(canonicalizeReusedItems(autoRepairLesson(addHistoricalDistractors(mergeSelectedReviewItems(lesson, req), req)), req));

  const firstValidation = validateLesson(result);
  if (!firstValidation.valid && firstValidation.errors.length > 0) {
    result = await autoFixLesson(result, firstValidation.errors, onProgress);
    result = repairItemRefs(canonicalizeReusedItems(result, req));
  }

  onProgress?.('✅ Taslak hazır!');
  return result;
}

function assertNoExistingFocusVocabulary(req: AIGenerationRequest): void {
  const canonicalByKu = buildHistoricalCanonicalMap(req);
  if (canonicalByKu.size === 0) return;

  const duplicateFocus = (req.focusVocabulary ?? [])
    .map(word => ({ word, canonical: canonicalByKu.get(normalizeKu(word)) }))
    .filter((entry): entry is { word: string; canonical: NonNullable<typeof entry.canonical> } =>
      Boolean(entry.canonical),
    );

  if (duplicateFocus.length === 0) return;

  throw new Error(
    `SERT KURAL: 5 yeni kelime listesinde daha önce üretilmiş kelime var. ` +
    `Aynı Kürtçe kelime için ikinci kart oluşturulamaz. ` +
    `Bunları yeni kelime listesinden çıkarıp 3 tekrar seçiminde mevcut kart olarak seçmelisin: ` +
    duplicateFocus.map(({ word, canonical }) =>
      `"${word}" → mevcut kart ${canonical.item.id}` +
      (canonical.lessonId ? ` (${canonical.lessonId})` : ''),
    ).join(', ') +
    `. Eğer bu gerçekten sesteş/ayrı anlam ise önce item.ku veya meaningGroup ile açıkça ayrıştırılacak ayrı bir homograph modeli eklenmeli; şu an otomatik ikinci kart yasak.`,
  );
}

function normalizeKu(ku: string | undefined): string {
  return (ku ?? '').trim().toLocaleLowerCase('tr-TR');
}

function findReusableItemsForWords(
  req: AIGenerationRequest,
  words: string[],
): { item: CurriculumMediaItem; media?: unknown; globalLessonOrder: number }[] {
  const wanted = new Set(words.map(normalizeKu).filter(Boolean));
  if (wanted.size === 0) return [];
  return Array.from(buildHistoricalCanonicalMap(req).values())
    .filter(entry => wanted.has(normalizeKu(entry.item.ku)));
}

function buildHistoricalCanonicalMap(
  req: AIGenerationRequest,
): Map<string, { item: CurriculumMediaItem; media?: unknown; globalLessonOrder: number; lessonId?: string }> {
  const map = new Map<string, { item: CurriculumMediaItem; media?: unknown; globalLessonOrder: number; lessonId?: string }>();
  const contexts = [...(req.previousLessonsContext ?? [])].sort((a, b) =>
    (a.globalLessonOrder ?? globalLessonOrder(a.unitId ?? req.unitId, a.lessonOrder)) -
    (b.globalLessonOrder ?? globalLessonOrder(b.unitId ?? req.unitId, b.lessonOrder)),
  );

  for (const ctx of contexts) {
    const order = ctx.globalLessonOrder ?? globalLessonOrder(ctx.unitId ?? req.unitId, ctx.lessonOrder);
    for (const item of ctx.items ?? []) {
      const key = normalizeKu(item.ku);
      if (!key || map.has(key)) continue;
      map.set(key, {
        item,
        media: ctx.mediaStatus?.[item.id],
        globalLessonOrder: order,
        lessonId: ctx.lessonId,
      });
    }
  }
  return map;
}

function remapStepIds(step: CurriculumLessonStep, remap: Map<string, string>): CurriculumLessonStep {
  if (remap.size === 0) return step;
  const s = { ...step } as Record<string, unknown>;
  const remapId = (id: unknown) => typeof id === 'string' ? (remap.get(id) ?? id) : id;
  const remapIds = (ids: unknown) => Array.isArray(ids) ? ids.map(id => remapId(id)) : ids;

  s.itemId = remapId(s.itemId);
  s.imageItemId = remapId(s.imageItemId);
  s.correctItemId = remapId(s.correctItemId);
  s.targetItemId = remapId(s.targetItemId);
  s.blankItemId = remapId(s.blankItemId);
  s.oddItemId = remapId(s.oddItemId);
  s.distractorItemIds = remapIds(s.distractorItemIds);
  s.itemIds = remapIds(s.itemIds);
  s.summaryItemIds = remapIds(s.summaryItemIds);
  if (Array.isArray(s.pairs)) {
    s.pairs = (s.pairs as Array<Record<string, unknown>>).map(pair => ({
      ...pair,
      leftItemId: remapId(pair.leftItemId),
      rightItemId: remapId(pair.rightItemId),
    }));
  }
  return s as unknown as CurriculumLessonStep;
}

function canonicalizeReusedItems(lesson: AdminLesson, req: AIGenerationRequest): AdminLesson {
  const canonicalByKu = buildHistoricalCanonicalMap(req);
  if (canonicalByKu.size === 0) return lesson;

  const remap = new Map<string, string>();
  const mediaStatus = { ...(lesson.mediaStatus ?? {}) };
  const itemsById = new Map<string, CurriculumMediaItem>();

  for (const item of lesson.items) {
    const canonical = canonicalByKu.get(normalizeKu(item.ku));
    if (canonical && canonical.item.id !== item.id) {
      remap.set(item.id, canonical.item.id);
      itemsById.set(canonical.item.id, canonical.item);
      const normalized = normalizeReusedMedia(canonical.media);
      if (normalized) mediaStatus[canonical.item.id] = normalized;
      continue;
    }
    itemsById.set(item.id, item);
  }

  if (remap.size === 0) return lesson;

  const steps = lesson.steps.map(step => remapStepIds(step, remap));
  const remapList = (ids: string[] | undefined) =>
    ids ? Array.from(new Set(ids.map(id => remap.get(id) ?? id))) : ids;

  for (const oldId of Array.from(remap.keys())) {
    delete mediaStatus[oldId];
  }

  return {
    ...lesson,
    items: Array.from(itemsById.values()),
    steps,
    reviewItemIds: remapList(lesson.reviewItemIds) ?? [],
    externalDistractorItemIds: remapList(lesson.externalDistractorItemIds),
    mediaStatus: Object.keys(mediaStatus).length ? mediaStatus : lesson.mediaStatus,
  };
}

function mergeSelectedReviewItems(lesson: AdminLesson, req: AIGenerationRequest): AdminLesson {
  if (!req.reviewItems?.length) return lesson;
  const reviewById = new Map(req.reviewItems.map(r => [r.item.id, r.item]));
  const reviewKu = new Set(req.reviewItems.map(r => r.item.ku.trim().toLocaleLowerCase('tr-TR')));
  const newItems = lesson.items
    .filter(item => !reviewById.has(item.id))
    .filter(item => !reviewKu.has(item.ku.trim().toLocaleLowerCase('tr-TR')))
    .slice(0, 5);
  const mergedItems = [...newItems, ...req.reviewItems.map(r => r.item)];

  const mediaStatus = { ...(lesson.mediaStatus ?? {}) };
  for (const review of req.reviewItems) {
    const normalized = normalizeReusedMedia(review.media);
    if (normalized) mediaStatus[review.item.id] = normalized;
  }

  const mergedLesson: AdminLesson = {
    ...lesson,
    items: mergedItems,
  };
  if (Object.keys(mediaStatus).length) mergedLesson.mediaStatus = mediaStatus;
  return mergedLesson;
}

function normalizeReusedMedia(
  media: unknown,
): NonNullable<AdminLesson['mediaStatus']>[string] | undefined {
  if (!media || typeof media !== 'object') return undefined;
  const value = media as Partial<NonNullable<AdminLesson['mediaStatus']>[string]>;
  return {
    imageUrl: value.imageUrl,
    imageStoragePath: value.imageStoragePath,
    imageStatus: value.imageUrl ? 'approved' : (value.imageStatus ?? 'pending'),
    audioUrl: value.audioUrl,
    audioStoragePath: value.audioStoragePath,
    audioStatus: value.audioUrl ? 'verified' : (value.audioStatus ?? 'missing'),
  };
}

const DISTRACTOR_STEP_TYPES = new Set([
  'image_to_word',
  'word_to_image',
  'listen_to_word',
  'listen_to_image',
  'fill_blank',
]);

function shuffleStable<T>(items: T[], seed: string): T[] {
  const out = [...items];
  let state = 0;
  for (let i = 0; i < seed.length; i += 1) {
    state = (state * 31 + seed.charCodeAt(i)) >>> 0;
  }
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function historicalDistractorPool(req: AIGenerationRequest): { item: CurriculumMediaItem; media?: unknown }[] {
  const byId = new Map<string, { item: CurriculumMediaItem; media?: unknown }>();
  for (const lessonCtx of req.previousLessonsContext ?? []) {
    for (const item of lessonCtx.items ?? []) {
      byId.set(item.id, { item, media: lessonCtx.mediaStatus?.[item.id] });
    }
  }
  return [...byId.values()];
}

function targetIdForStep(step: CurriculumLessonStep): string | undefined {
  const s = step as unknown as Record<string, unknown>;
  return (s.correctItemId ?? s.targetItemId ?? s.blankItemId ?? s.imageItemId) as string | undefined;
}

function canUseAsHistoricalDistractor(target: CurriculumMediaItem | undefined, candidate: CurriculumMediaItem): boolean {
  if (!target) return true;
  if (target.id === candidate.id) return false;
  if (target.meaningGroup && candidate.meaningGroup && target.meaningGroup === candidate.meaningGroup) return false;
  if (target.confusableWithItemIds?.includes(candidate.id) || candidate.confusableWithItemIds?.includes(target.id)) return false;
  if (target.avoidWithItemIds?.includes(candidate.id) || candidate.avoidWithItemIds?.includes(target.id)) return false;
  return true;
}

function addHistoricalDistractors(lesson: AdminLesson, req: AIGenerationRequest): AdminLesson {
  const pool = historicalDistractorPool(req);
  if (pool.length === 0) return lesson;

  const itemById = new Map(lesson.items.map(item => [item.id, item]));
  for (const { item } of pool) {
    if (!itemById.has(item.id)) itemById.set(item.id, item);
  }

  const mediaStatus = { ...(lesson.mediaStatus ?? {}) };
  const externalIds = new Set(lesson.externalDistractorItemIds ?? []);
  const reviewIds = new Set(lesson.reviewItemIds ?? []);

  const steps = lesson.steps.map(step => {
    if (!DISTRACTOR_STEP_TYPES.has(step.type) || !('distractorItemIds' in step)) return step;

    const targetId = targetIdForStep(step);
    const target = targetId ? itemById.get(targetId) : undefined;
    const current = [...(((step as { distractorItemIds?: string[] }).distractorItemIds) ?? [])];
    const currentSet = new Set([...current, ...(targetId ? [targetId] : [])]);
    const historicalCurrent = current.filter(id => pool.some(p => p.item.id === id) && id !== targetId);

    // GPT zaten geçmişsel ID koymuşsa bunları da externalIds'e ekle — finalItems'a girmeleri gerekiyor.
    for (const id of historicalCurrent) {
      externalIds.add(id);
      const poolEntry = pool.find(p => p.item.id === id);
      if (poolEntry) {
        if (!itemById.has(id)) itemById.set(id, poolEntry.item);
        const normalized = normalizeReusedMedia(poolEntry.media);
        if (normalized) mediaStatus[id] = normalized;
      }
    }

    if (historicalCurrent.length >= 2) return step;

    const candidates = shuffleStable(pool, `${lesson.id}:${step.id}`)
      .map(p => p.item)
      .filter(item => !currentSet.has(item.id))
      .filter(item => canUseAsHistoricalDistractor(target, item));

    const needed = 2 - historicalCurrent.length;
    const selected = candidates.slice(0, needed);
    if (selected.length === 0) return step;

    for (const item of selected) {
      externalIds.add(item.id);
      const media = pool.find(p => p.item.id === item.id)?.media;
      const normalized = normalizeReusedMedia(media);
      if (normalized) mediaStatus[item.id] = normalized;
    }

    const mergedDistractors = [...selected.map(item => item.id), ...current]
      .filter((id, idx, arr) => id !== targetId && arr.indexOf(id) === idx)
      .slice(0, 3);

    return { ...step, distractorItemIds: mergedDistractors } as CurriculumLessonStep;
  });

  for (const id of reviewIds) externalIds.delete(id);

  // Sadece orijinal ders item'ları + seçilen external distractorlar lesson.items'a girer.
  // Pool'daki ama seçilmeyen item'lar itemById'da kalmaya devam eder (repairItemRefs için gerekli)
  // ama final lesson.items'a dahil edilmez — bu şekilde productionItems'a düşüp yeni görsel açmaz.
  const originalItemIds = new Set(lesson.items.map(i => i.id));
  const finalItems = [...itemById.values()].filter(
    item => originalItemIds.has(item.id) || externalIds.has(item.id),
  ).map(item => externalIds.has(item.id)
    ? { ...item, tags: [...new Set([...(item.tags ?? []), 'distractor_only'])] }
    : item
  );

  const mergedLesson: AdminLesson = {
    ...lesson,
    items: finalItems,
    steps,
    externalDistractorItemIds: [...externalIds],
  };
  if (Object.keys(mediaStatus).length) mergedLesson.mediaStatus = mediaStatus;
  return mergedLesson;
}

// ========== OTO-ONARIM ==========

function fixKurdishChars(text: string): string {
  return text
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U');
}

function autoRepairLesson(lesson: AdminLesson): AdminLesson {
  const fix = (s: string | undefined) => s ? fixKurdishChars(s) : s;
  return {
    ...lesson,
    items: lesson.items.map(item => ({
      ...item,
      ku: fix(item.ku) ?? item.ku,
      exampleKu: fix(item.exampleKu),
      pronunciation: fix(item.pronunciation),
    })),
  };
}

export async function autoFixLesson(
  lesson: AdminLesson,
  errors: string[],
  onProgress?: (msg: string) => void,
): Promise<AdminLesson> {
  const unit = UNITS.find(u => u.id === lesson.unitId);
  if (!unit) return lesson;

  const providerLabel = getTextProviderLabel();
  onProgress?.(`🔧 ${errors.length} hata ${providerLabel} ile otomatik düzeltiliyor...`);

  const fixPrompt = `KurdîGo ders JSON'unda validasyon hataları var. Aşağıdaki hataları gider, gerisi değişmesin.

HATALAR:
${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}

DÜZELTME KURALLARI:
- Yasak Türkçe karakterler (ğ,ı,ö,ü ve büyükleri) → Kurmanci alternatifleri: ğ→g, ı→i, ö→o, ü→u
- Distractor ID'leri items dizisindeki gerçek id değerleriyle birebir eşleşmeli
- Copula: ez→im, tu→î, ew→e kullan
- Selamlama grubu (silav,rojbaş,şevbaş,supas,xatirê te) birbirinin distraktörü OLAMAZ — sayı/renk/hayvan/nesne kullan
- fill_blank: en az 2 şık boşluğa oturmamalı; oturuyorsa distractorları değiştir
- Ambiguous distractor: doğru cevapla aynı meaningGroup'tan distractor seçme

DERS JSON:
${JSON.stringify({ items: lesson.items, steps: lesson.steps }, null, 2)}

Sadece {"items":[...],"steps":[...]} formatında düzeltilmiş JSON döndür.`;

  const raw = await generateTextJson({
    system: 'Sen Kurmanci Kürtçe ders kalite kontrol uzmanısın. Verilen JSON\'u kurallara göre düzelt. Sadece JSON döndür.',
    user: fixPrompt,
    temperature: 0.2,
    maxTokens: 16000,
  });

  if (!raw) { onProgress?.(`⚠️ ${providerLabel} fix yanıt vermedi — orijinal ders döndürülüyor`); return lesson; }

  try {
    const parsed = JSON.parse(raw) as { items?: CurriculumMediaItem[]; steps?: CurriculumLessonStep[] };
    const fixed: AdminLesson = {
      ...lesson,
      items: parsed.items ?? lesson.items,
      steps: parsed.steps ?? lesson.steps,
    };
    onProgress?.('✅ Otomatik düzeltme tamamlandı');
    return repairItemRefs(fixed);
  } catch {
    onProgress?.(`⚠️ ${providerLabel} fix parse hatası — orijinal ders döndürülüyor`);
    return lesson;
  }
}

// ========== BOZUK ID REFERANSLARI OTO-ONARICI ==========
// GPT bazen distractor olarak ku değerini (örn: "roj") yazar, tam ID'yi değil.
// Bu fonksiyon tüm step referanslarını tarar; geçersizleri en yakın item ID'siyle değiştirir.
function repairItemRefs(lesson: AdminLesson): AdminLesson {
  const validIds = new Set(lesson.items.map(i => i.id));
  const idList = lesson.items.map(i => i.id);

  function resolve(id: string | undefined, excludes: string[] = []): string {
    if (!id) return idList[0] ?? '';
    if (validIds.has(id)) return id;
    // GPT bazen id yerine ku değeri yazar — önce ku ile eşleştir
    const byKu = lesson.items.find(
      i => i.ku === id || i.ku.toLowerCase() === id.toLowerCase() || i.id.startsWith(id + '_'),
    );
    if (byKu) return byKu.id;
    // Bulunamazsa dışlananlar hariç ilk geçerli ID
    return idList.find(i => !excludes.includes(i)) ?? idList[0] ?? id;
  }

  const steps = lesson.steps.map(step => {
    const s = { ...step } as Record<string, unknown>;

    if (typeof s.itemId === 'string')      s.itemId      = resolve(s.itemId);
    if (typeof s.imageItemId === 'string') s.imageItemId = resolve(s.imageItemId);
    if (typeof s.correctItemId === 'string') s.correctItemId = resolve(s.correctItemId);
    if (typeof s.targetItemId === 'string')  s.targetItemId  = resolve(s.targetItemId);
    if (typeof s.blankItemId === 'string')   s.blankItemId   = resolve(s.blankItemId);

    if (Array.isArray(s.distractorItemIds)) {
      const correctId = (s.correctItemId ?? s.blankItemId ?? s.targetItemId) as string | undefined;
      s.distractorItemIds = (s.distractorItemIds as string[]).map(did =>
        resolve(did, correctId ? [correctId] : []),
      );
    }

    if (Array.isArray(s.pairs)) {
      s.pairs = (s.pairs as { leftItemId: string; rightItemId: string }[]).map(p => ({
        leftItemId:  resolve(p.leftItemId),
        rightItemId: resolve(p.rightItemId),
      }));
    }

    if (Array.isArray(s.summaryItemIds)) {
      s.summaryItemIds = (s.summaryItemIds as string[]).map(id => resolve(id));
    }

    return s as unknown as CurriculumLessonStep;
  });

  return { ...lesson, steps };
}

// ========== EKSİK BÖLÜM TAMAMLAYICI ==========

export async function completeMissingSection(
  lesson: AdminLesson,
  req: AIGenerationRequest,
  sectionIndex: 2 | 3,
  onProgress?: (msg: string) => void,
): Promise<AdminLesson> {
  const unit = UNITS.find(u => u.id === req.unitId);
  if (!unit) throw new Error(`Ünite bulunamadı: ${req.unitId}`);

  const sectionStart = (sectionIndex - 1) * 20;
  const existingInSection = lesson.steps.slice(sectionStart, sectionStart + 20);
  const missingCount = 20 - existingInSection.length;
  if (missingCount <= 0) return lesson;

  const sectionLabel = sectionIndex === 2
    ? 'Bölüm 2 — Sınav (bu dersin kelimeleri)'
    : 'Bölüm 3 — Tekrar (önceki derslerin kelimeleri)';

  onProgress?.(`🔧 ${sectionLabel}: ${missingCount} eksik adım üretiliyor...`);

  const isPhraseOnly = unit.id === 'unit1' || unit.id === 'unit2';
  const reviewIds = new Set(lesson.reviewItemIds ?? []);
  const newItems = lesson.items.filter(i => !reviewIds.has(i.id));
  const reviewItems = lesson.items.filter(i => reviewIds.has(i.id));
  const sectionItems = sectionIndex === 3 && reviewItems.length ? reviewItems : newItems;
  const itemIds = lesson.items.map(i => i.id).join(', ');
  const itemsSummary = lesson.items.map(i => `{id:"${i.id}", ku:"${i.ku}", tr:"${i.tr}"}`).join(', ');

  const prevWords = req.previousLessonsContext?.length
    ? req.previousLessonsContext.map(l => `Ders ${l.lessonOrder}: ${l.itemsKu.join(', ')}`).join(' | ')
    : `Önceki ders yok — bu dersin kelimeleriyle (${lesson.items.map(i => i.ku).join(', ')}) üret`;

  const phraseNote = isPhraseOnly
    ? `\nPHRASE_ONLY: sentenceKu ve word_order'da TAM CÜMLE YOK — sadece 2-3 kelimelik phrase (örn: "___ Berfin!", ["Deh","pirtûk"])`
    : '';

  const userPrompt = `
Var olan bir dersin ${sectionLabel} bölümü eksik. Tam olarak ${missingCount} adım üret.

MEVCUT ITEMS: [${itemsSummary}]

${sectionIndex === 3
  ? `TEKRAR KELİMELERİ: ${(reviewItems.length ? reviewItems.map(i => i.ku).join(', ') : prevWords)}`
  : `BU DERSİN YENİ KELİMELERİ: ${newItems.map(i => i.ku).join(', ')}`}
${phraseNote}

ZATEN ÜRETİLMİŞ TİPLER BU BÖLÜMDE: ${existingInSection.map(s => s.type).join(', ') || 'hiç yok'}

${missingCount === 20 ? `TİP DAĞILIMI (tam 20 adım):
- image_to_word ×4 — prompt:"", promptTr:""
- word_to_image ×4 — prompt:"Wêneyê meze ke.", promptTr:"Doğru resmi seç."
- fill_blank ×4 — prompt:"Valahiyê tijî bike.", promptTr:"Boşluğu doğru Kürtçe kelimeyle doldur."
- word_order ×4 — prompt:"Rêz bike.", promptTr:"Kürtçe kelimeleri doğru sıraya diz."
- listen_to_word ×2 — prompt:"Guhdarî bike.", promptTr:"Duyduğun Kürtçe kelime hangisi?"
- dictation ×1 — prompt:"Binivîse.", promptTr:"Duyduğun Kürtçe kelimeyi yaz."
- typing ×1 — prompt:"Binivîse.", promptTr:"Görseldeki nesnenin Kürtçesini yaz."` : `Eksik ${missingCount} adım — mevcut tiplerle çakışma yaratma`}

DISTRACTOR KURALI: Selamlama grubu (silav, rojbaş, şevbaş, supas) birbirinin distractorı OLAMAZ. Tamamen farklı kategoriden (hayvan, renk, sayı, nesne) seç.
AMBIGUOUS YASAK: Birden fazla cevap boşluğa oturabiliyorsa o soruyu YAPMA — farklı kelime seç.

BU BÖLÜMDE HEDEF OLACAK ID'LER: ${sectionItems.map(i => i.id).join(', ')}
GEÇERLİ ID LİSTESİ — distractor dahil sadece bunları kullan: ${itemIds}

{"steps": [...]} formatında döndür. Sadece JSON, başka hiçbir şey.
`;

  const providerLabel = getTextProviderLabel();
  const pSettings = await getProjectSettings().catch(() => ({ imageBrief: '', textQualityRules: '' }));
  const raw = await generateTextJson({
    system: buildSystemPrompt(pSettings.textQualityRules || undefined),
    user: userPrompt,
    temperature: 0.7,
    maxTokens: 8000,
  });

  if (!raw) throw new Error(`${providerLabel} boş yanıt döndürdü.`);

  let newSteps: CurriculumLessonStep[];
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const stepsVal = parsed.steps ?? Object.values(parsed).find(v => Array.isArray(v));
  if (!Array.isArray(stepsVal)) throw new Error('Yanıtta steps dizisi bulunamadı');
  newSteps = stepsVal as CurriculumLessonStep[];

  onProgress?.('✅ Adımlar ekleniyor...');

  const before = lesson.steps.slice(0, sectionStart);
  const after = lesson.steps.slice(sectionStart + 20);

  const merged: CurriculumLessonStep[] = [
    ...before,
    ...existingInSection,
    ...newSteps.slice(0, missingCount),
    ...after,
  ];

  return repairItemRefs(addHistoricalDistractors({ ...lesson, steps: merged }, req));
}

// ========== TAM DOĞRULAMA (Tüm Kurallar) ==========

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const FORBIDDEN_KU_CHARS = /[ğĞıİöÖüÜ]/;
const FORBIDDEN_A1_CONSTRUCTS = /\s(ji bo|yê|ya|yên)\s/;

export function validateLesson(lesson: AdminLesson): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const itemIds = new Set(lesson.items.map(i => i.id));
  const externalDistractorIds = new Set(lesson.externalDistractorItemIds ?? []);
  const coreItems = lesson.items.filter(i => !externalDistractorIds.has(i.id));

  // ─── ITEM KURALLARI ───
  const seenIds = new Set<string>();
  lesson.items.forEach(item => {
    // Benzersizlik
    if (seenIds.has(item.id)) errors.push(`❌ Tekrarlı item ID: "${item.id}"`);
    seenIds.add(item.id);

    // Zorunlu alanlar
    if (!item.ku) errors.push(`❌ item "${item.id}": ku (Kürtçe) boş`);
    if (!item.tr) errors.push(`❌ item "${item.id}": tr (Türkçe) boş`);
    if (!item.en) warnings.push(`⚠️ item "${item.id}" (${item.ku}): İngilizce eksik`);
    if (!item.emoji) warnings.push(`⚠️ item "${item.id}" (${item.ku}): emoji eksik`);
    if (!item.partOfSpeech) warnings.push(`⚠️ item "${item.id}" (${item.ku}): partOfSpeech eksik`);
    if (!item.meaningGroup) warnings.push(`⚠️ item "${item.id}" (${item.ku}): meaningGroup eksik`);
    if (!item.exampleKu) warnings.push(`⚠️ item "${item.id}" (${item.ku}): Kürtçe örnek cümle eksik`);
    if (!item.exampleEn) warnings.push(`⚠️ item "${item.id}" (${item.ku}): İngilizce örnek eksik`);
    if (!item.visualAffordanceTags?.length) warnings.push(`⚠️ item "${item.id}" (${item.ku}): visualAffordanceTags eksik`);

    // [AI-ERR] Kürmanci kuralları
    if (item.ku && FORBIDDEN_KU_CHARS.test(item.ku)) {
      errors.push(`❌ [AI-ERR-0] "${item.ku}": Yasak Türkçe karakter!`);
    }
    if (item.ku && item.ku === item.tr) {
      errors.push(`❌ item "${item.id}": Kürtçe = Türkçe (placeholder çeviri)`);
    }
    if (item.ku && FORBIDDEN_A1_CONSTRUCTS.test(` ${item.ku} `)) {
      warnings.push(`⚠️ [AI-ERR-A1] "${item.ku}": A2+ yapı (ji bo/yê/ya/yên) — A1'de kullanma`);
    }
    if (item.ku && item.ku.split(' ').length > 6) {
      warnings.push(`⚠️ [AI-ERR-A1] "${item.ku}": 6+ token — A1 sınırı aşıldı`);
    }
    // [AI-ERR-5] Lokatif calque
    if (item.ku && /\bde\b/.test(item.ku) && !/\b(dibe|dike|diçe|dikeve|dibêje|dilêgire|diafirîne)\b/.test(item.ku)) {
      warnings.push(`⚠️ [AI-ERR-5] "${item.ku}": Yalnız "de" lokatif calque olabilir. "li + isim" kullan.`);
    }
    // [AI-ERR-7] Zamir düşürme A1
    if (item.ku && /^(baş|nexweş)\s+(im|î|e|in)\b/.test(item.ku)) {
      errors.push(`❌ [AI-ERR-7] "${item.ku}": A1'de zamir düşürme! "Ez baş im." şeklinde yaz.`);
    }
    // [AI-ERR-9] Soru kelime sırası
    if (item.ku && /\b(im|î|e|in)\b.*\b(çawa|kî|çi|ku|kengê|çiqas)\b/.test(item.ku)) {
      errors.push(`❌ [AI-ERR-9] "${item.ku}": Soru kelimesi copuladan sonra gelmez. "Tu çawa yî?" şeklinde yaz.`);
    }
    // [AI-ERR-6] Baş e calque
    if (item.ku === 'baş e' && item.meaningGroup?.includes('tamam')) {
      errors.push(`❌ [AI-ERR-6] "baş e" = "iyidir", "tamam/OK" değil. Farklı kelime kullan.`);
    }
    // Copula uyumsuzluğu
    if (item.ku && /\bez\b.*\bî\b/.test(item.ku)) {
      errors.push(`❌ Copula uyumsuz: "${item.ku}" — "ez" ile "î" kullanılmaz, "im" kullan.`);
    }
    if (item.ku && /\btu\b.*\bim\b/.test(item.ku)) {
      errors.push(`❌ Copula uyumsuz: "${item.ku}" — "tu" ile "im" kullanılmaz, "î" kullan.`);
    }
    // heval vokatif
    if (item.ku?.includes('heval') && item.tr?.includes('arkadaş') && !item.tr?.includes('arkadaşım')) {
      warnings.push(`⚠️ "${item.ku}": Vokatif "heval" → Türkçe "arkadaşım" olmalı (arkadaş değil)`);
    }
  });

  // ─── ADIM KURALLARI ───
  const stepTypes = lesson.steps.map(s => s.type);
  if (coreItems.length < 6) errors.push(`❌ Yetersiz ana kelime: ${coreItems.length} (min 6)`);
  if (coreItems.length < 8) warnings.push(`⚠️ Tavsiye edilen: 8 ana kelime (şu an ${coreItems.length})`);

  const totalSteps = lesson.steps.length;
  if (totalSteps < 40) warnings.push(`⚠️ Az adım: ${totalSteps} (hedef 60)`);
  if (totalSteps > 70) warnings.push(`⚠️ Çok adım: ${totalSteps} (hedef 60)`);

  // culturalFocusTags zorunlu
  if (!lesson.culturalFocusTags?.length) {
    warnings.push('⚠️ culturalFocusTags boş — en az bir kültürel etiket ekle');
  }

  // ─── DISTRACTOR KURALLARI ───
  lesson.steps.forEach(step => {
    if ('distractorItemIds' in step && step.distractorItemIds) {
      const distractorIds = step.distractorItemIds as string[];
      distractorIds.forEach(did => {
        if (!itemIds.has(did)) {
          errors.push(`❌ Adım "${step.id}": distractor "${did}" items listesinde yok`);
        }
      });
      if ((lesson.lessonOrder > 1 || (lesson.reviewItemIds?.length ?? 0) > 0) && DISTRACTOR_STEP_TYPES.has(step.type)) {
        const historicalCount = distractorIds.filter(id => externalDistractorIds.has(id)).length;
        if (historicalCount < 2) {
          warnings.push(`⚠️ [historical-distractor] Adım "${step.id}": önceki derslerden en az 2 random distractor olmalı (${historicalCount}/2)`);
        }
      }
    }
    if ('correctItemId' in step) {
      const cid = (step as { correctItemId: string }).correctItemId;
      if (!itemIds.has(cid)) errors.push(`❌ Adım "${step.id}": correctItemId "${cid}" items listesinde yok`);
    }
    if ('targetItemId' in step) {
      const tid = (step as { targetItemId: string }).targetItemId;
      if (!itemIds.has(tid)) errors.push(`❌ Adım "${step.id}": targetItemId "${tid}" items listesinde yok`);
    }
    if ('blankItemId' in step) {
      const bid = (step as { blankItemId: string }).blankItemId;
      if (!itemIds.has(bid)) errors.push(`❌ Adım "${step.id}": blankItemId "${bid}" items listesinde yok`);
    }

    // Distractor meaningGroup çakışması
    if ('blankItemId' in step && 'distractorItemIds' in step) {
      const blankItem = lesson.items.find(i => i.id === (step as { blankItemId: string }).blankItemId);
      if (blankItem?.meaningGroup) {
        (step as { distractorItemIds: string[] }).distractorItemIds?.forEach(did => {
          const distractor = lesson.items.find(i => i.id === did);
          if (distractor?.meaningGroup === blankItem.meaningGroup) {
            warnings.push(`⚠️ [ambiguous-distractor] Adım "${step.id}": "${did}" cevapla aynı meaningGroup'ta — belirsizliğe yol açabilir`);
          }
        });
      }
    }

    // Prompt zorunlu (prompt-free tipler hariç)
    const PROMPT_FREE = ['typing', 'character_dialogue', 'pronunciation_drill', 'dictation', 'grammar_card', 'reading_passage', 'learn_card'];
    if (!PROMPT_FREE.includes(step.type) && 'prompt' in step && !(step as { prompt?: string }).prompt) {
      warnings.push(`⚠️ Adım "${step.id}" (${step.type}): prompt boş`);
    }

    // audioText zorunluluk (listen/dictation)
    if (['listen_to_word', 'listen_to_image', 'dictation'].includes(step.type)) {
      if (!('audioText' in step) || !(step as { audioText?: string }).audioText) {
        warnings.push(`⚠️ Adım "${step.id}" (${step.type}): audioText eksik`);
      }
    }
  });

  // ─── GÖRSEL ÇAKIŞMA KURALI ───
  const imageUsage = new Map<string, number>();
  lesson.steps.forEach(step => {
    const imgId = 'imageItemId' in step ? (step as { imageItemId?: string }).imageItemId : undefined;
    if (imgId) imageUsage.set(imgId, (imageUsage.get(imgId) ?? 0) + 1);
  });
  imageUsage.forEach((count, imgId) => {
    if (count > 4) warnings.push(`⚠️ Görsel çakışma: "${imgId}" bu derste ${count} kez kullanılıyor`);
  });

  return { valid: errors.length === 0, errors, warnings };
}
