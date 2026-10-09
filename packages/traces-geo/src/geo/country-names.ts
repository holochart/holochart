/**
 * Country names and codes → ISO 3166-1 alpha-3, for `locationmode: 'country names'` (backlog GEO3,
 * GEO4). This is what plotly.js 4.1.1 resolves country names with (`countryNameToISO3` in
 * `src/lib/geo_location_utils.js`): the records and the matching rules of `country-iso-search`
 * 0.1.2, plus Plotly's own records for six disputed territories.
 *
 * Ported from:
 *
 * - country-iso-search 0.1.2 (https://github.com/plotly/country-iso-search), `src/countries.ts`
 *   (the table) and `src/index.ts` (`sanitize`, `createLookup`). MIT License, Copyright (c) 2026
 *   Plotly Technologies Inc. Its records follow UN M49 and ISO 3166-1; its aliases were curated
 *   from the GeoNames Geographical Database (https://www.geonames.org/, Creative Commons
 *   Attribution 4.0), the Unicode Common Locale Data Repository (https://cldr.unicode.org/,
 *   Unicode License V3, Copyright © 1991-2026 Unicode, Inc.) and Wikidata
 *   (https://www.wikidata.org/, CC0 1.0). The notices are in THIRD_PARTY_NOTICES.md.
 * - plotly.js 4.1.1, `src/lib/custom_country_codes.ts` (the six `X..` records before the last).
 *   MIT License, Copyright (c) 2016-2024 Plotly Technologies Inc.
 *
 * One record is Holochart's: Kosovo, under the user-assigned codes `XKX` and `XK`. It is not in
 * ISO 3166-1, so neither source has it, but the basemap (Natural Earth) has the country under
 * that id.
 *
 * The table is 38 kB of text, so this module is a chunk of its own, loaded the first time a figure
 * uses `'country names'` (`location-data.ts`). Nothing else may import it but for its types.
 *
 * ## The table
 *
 * One record per line: `ISO-3|ISO-2|M49|name|alias|alias|…`. The name is the English short name of
 * UN M49. The aliases are match keys, already in the form {@link sanitize} gives (lowercase, no
 * diacritics or punctuation): historical names, common alternates, names in the country's official
 * languages and its flag emoji. Do not add accented or punctuated variants: the lookup sanitizes
 * what it is asked the same way.
 */

const TABLE = `
ABW|AW|533|Aruba|🇦🇼|country of aruba|land aruba|pais aruba
AFG|AF|004|Afghanistan|🇦🇫|affghanistan|affghanisthan|affghaunistan|afghania|afghanisthan|afghaunistan|afghaunistaun|afgoniston|de afghanistan islami jumhuriyat|owganystan|афғонистон|أفغانستان|افغانستان|د افغانستان اسلامی جمهوریت
AGO|AO|024|Angola|🇦🇴|republic of angola|republica de angola
AIA|AI|660|Anguilla|🇦🇮|malliouhana
ALA|AX|248|Åland Islands|🇦🇽|aaland|aaland islands|ahvenanmaa|aland|aland isles|aland region|alands lan|landskapet aland
ALB|AL|008|Albania|🇦🇱|peoples republic of albania|peoples socialist republic of albania|republic of albania|republika e shqiperise|shqiperi|shqiperia|shqiperise|socialist republic of albania
AND|AD|020|Andorra|🇦🇩|el pais dels pirineus|les valls dandorra|principality of andorra|principality of the valleys of andorra|principat dandorra|valls dandorra
ARE|AE|784|United Arab Emirates|🇦🇪|emirates|uae|الإمارات|الإمارات العربية المتحدة|الامارات|الامارات العربية المتحدة|دولة الإمارات العربية المتحدة
ARG|AR|032|Argentina|🇦🇷|argentine republic|nacion argentina|republic of argentina|republica argentina
ARM|AM|051|Armenia|🇦🇲|hayastan|hayastani hanrapetutyun|republic of armenia|հայաստան|հայաստանի հանրապետություն|հայք|հհ
ASM|AS|016|American Samoa|🇦🇸|amerika samoa|east samoa|samoa american|samoa united states|territory of american samoa|us samoa
ATA|AQ|010|Antarctica|🇦🇶|antarctica treaty area
ATF|TF|260|French Southern Territories|🇹🇫|taaf|terres australes et antarctiques francaises|terres australes francaises|terres australes francaises les|territoire des terres australes et antarctiques francaises
ATG|AG|028|Antigua and Barbuda|🇦🇬|antigua|antigua barbuda|barbuda
AUS|AU|036|Australia|🇦🇺|commonwealth of australia|new holland|new hollandia|nova hollandia
AUT|AT|040|Austria|🇦🇹|osterreich|republic of austria|republik osterreich|zweite republik
AZE|AZ|031|Azerbaijan|🇦🇿|azərbaycan|azərbaycan respublikası|republic of azerbaijan
BDI|BI|108|Burundi|🇧🇮|gouvernement du burundi|la republique du burundi|republic of burundi|republika yu burundi|republika yuburundi|republique du burundi|repuburika yuburundi|uburundi
BEL|BE|056|Belgium|🇧🇪|belg|belgie|belgien|belgique|kingdom of belgium|konigreich belgien|koninkrijk belgie|royaume de belgique
BEN|BJ|204|Benin|🇧🇯|dahomey|la republique du benin|republic of benin|republique du benin
BES|BQ|535|Bonaire, Sint Eustatius and Saba|🇧🇶|bes eilanden|bes islands|bijzondere gemeente|bonaire|bonaire saint eustatius and saba|bonaire sint eustatius en saba|caraibisch nederland|caribbean netherlands|caribisch nederland|hulanda karibense|islanan bes|netherlands antilles|saba|sint eustatius
BFA|BF|854|Burkina Faso|🇧🇫|republic of burkina faso|republic of upper volta
BGD|BD|050|Bangladesh|🇧🇩|bangla desh|east pakistan|gonaoprojatontri bangladesh|peoples republic of bangladesh|গণপ্রজাতন্ত্রী বাংলাদেশ|বাংলা দেশ|বাংলাদেশ|বিডি
BGR|BG|100|Bulgaria|🇧🇬|bulgarian republic|republic of bulgaria|republika bulgaria|republika bulgariya|бг|българия|република българия
BHR|BH|048|Bahrain|🇧🇭|bahrein islands|kingdom of bahrain|البحرين|دولة البحرين|مملكة البحرين
BHS|BS|044|Bahamas|🇧🇸|bahama islands|bahamas the|commonwealth of the bahamas
BIH|BA|070|Bosnia and Herzegovina|🇧🇦|bosna|bosna i hercegovina|bosnia|bosnia and hercegovina|bosnia herzegovina|hercegovina|herzegovina|бих|босна|босна и херцеговина|бх
BLM|BL|652|Saint Barthélemy|🇧🇱|collectivite doutre mer de saint barthelemy|collectivite territoriale de saint barthelemy|collectivity of saint barthelemy|saint barth|saint barths|saint barts|saint bartz
BLR|BY|112|Belarus|🇧🇾|republic of belarus|respublika belarus|respublika byelarus|беларуская рэспубліка|беларусь|белая русь|белоруссия|рб|республика беларусь|рэспубліка беларусь
BLZ|BZ|084|Belize|🇧🇿
BMU|BM|060|Bermuda|🇧🇲|barmuda|barmuda i|barmuda isl|barmuda islands|barmudas|bermoothes|bermuda islands|bermudas|bermudian islands|colony of bermuda|devils isles|isle of devils|somers islands|somers isles|summers isles|territory of bermuda|virgineola
BOL|BO|068|Bolivia (Plurinational State of)|🇧🇴|bolivia|bulibiya|estado plurinacional de bolivia|plurinational state of bolivia|puliwya|republic of bolivia|republica de bolivia|volivia|wuliwiya|wuliwya
BRA|BR|076|Brazil|🇧🇷|brasil|federative republic of brazil|pindorama|republica federativa do brasil
BRB|BB|052|Barbados|🇧🇧|barbadoes
BRN|BN|096|Brunei Darussalam|🇧🇳|brunei|nation of brunei the abode of peace|negara brunei darussalam
BTN|BT|064|Bhutan|🇧🇹|kingdom of bhutan|འབྲུག|འབྲུག་ཡུལ་|འབྲུགཡུལ་་
BVT|BV|074|Bouvet Island|🇧🇻
BWA|BW|072|Botswana|🇧🇼|lefatshe la botswana|republic of botswana
CAF|CF|140|Central African Republic|🇨🇫|centrafricaine republique|centrafrique|central africa|kodorosese ti beafrika|la republique|rep centrafrique|republique centrafricaine
CAN|CA|124|Canada|🇨🇦|le canada
CCK|CC|166|Cocos (Keeling) Islands|🇨🇨|cocos islands|keeling islands|territory of the cocos keeling islands
CHE|CH|756|Switzerland|🇨🇭|confederation helvetique|confederation suisse|confederazione elvetica|confederazione svizzera|confederaziun svizra|confoederatio helvetica|confœderatio helvetica|eidgenossenschaft|elvezia|helvetie|la confederation suisse|schweiz|schweizerische eidgenossenschaft|suisse|svizra|svizzera|swiss|swiss confederation
CHL|CL|152|Chile|🇨🇱|republic of chile|republica de chile
CHN|CN|156|China|🇨🇳|china pr|peoples republic of china|pr china|prc|中华人民共和国|中国
CIV|CI|384|Côte d'Ivoire|🇨🇮|cote ivoire|ivory coast|republic of cote divoire|republic of ivory coast|republic of the ivory coast|republique de cote divoire
CMR|CM|120|Cameroon|🇨🇲|cameroun|la republique du cameroun|republic of cameroon|republique du cameroun
COD|CD|180|Democratic Republic of the Congo|🇨🇩|congo belge|congo democratic republic of the|congo kinshasa|dem rep congo|dem republic of congo|dem republic of the congo|democratic republic of congo|dr congo|drc|rd congo|rep demcongo|republic of the congo|republique democratique du congo|republique du zaire|zaire
COG|CG|178|Congo|🇨🇬|congo brazza|congo brazzaville|congo republic|rep congo|republic of congo|republique du congo
COK|CK|184|Cook Islands|🇨🇰|cook group|hervey islands
COL|CO|170|Colombia|🇨🇴|republic of colombia|republica de colombia
COM|KM|174|Comoros|🇰🇲|comores|comores archipel|etat comorien|lunion des comores|republique des comores|republique federale et islamique des comores|republique federale islamique des comores|territoire des comores|union des comores|union of the comoros|إتحاد القمر|اتحاد جزر القمر|الاتحاد القمري|القمر|جزر القمر|جمهورية القمر المتحدة|جمهورية جزر القمر الاتحادية الإسلامية|جمهورية جزرالقمر المتحدة
CPV|CV|132|Cabo Verde|🇨🇻|cape verde|cape verde islands|kab verd|kabu verdi|kauberdi|republic of cabo verde|republic of cape verde|republica de cabo verde
CRI|CR|188|Costa Rica|🇨🇷|republic of costa rica|republica de costa rica
CUB|CU|192|Cuba|🇨🇺|isla juana|republic of cuba|republica de cuba
CUW|CW|531|Curaçao|🇨🇼|corsou|corsouw|corsow|country of curacao|curacau|curacoa|curazao|curaςao|curocao|island territory of curacao|korsou|land curacao|pais korsou
CXR|CX|162|Christmas Island|🇨🇽|christmas island other territories|christmas island other territories australia|territory of christmas island
CYM|KY|136|Cayman Islands|🇰🇾|caymans
CYP|CY|196|Cyprus|🇨🇾|greek administration of southern cyprus|greek cypriot state|guney kıbrıs|guney kıbrıs rum cumhuriyeti|guney kıbrıs rum kesimi|guney kıbrıs rum yonetimi|kipriaki dhimokratia|kıbrıs|kıbrıs cumhuriyeti|kıbrıs rum kesimi|kypriaki dimokratia|kypros|republic of cyprus|κυπριακη δημοκρατια|κυπρος
CZE|CZ|203|Czechia|🇨🇿|ceska republika|ceske kraje|ceske uzemi|ceske zeme|cesko|cr|czech republic
DEU|DE|276|Germany|🇩🇪|br deutschland|bundesrepublik|bundesrepublik deutschland|deutschland|federal republic of germany
DJI|DJ|262|Djibouti|🇩🇯|la republique de djibouti|republic of djibouti|republique de djibouti|جمهورية جيبوتي|جيبوتي
DMA|DM|212|Dominica|🇩🇲|commonwealth of dominica|island of dominica|waitu kubuli
DNK|DK|208|Denmark|🇩🇰|dania|danmark|denmark proper|kongeriget danmark|metropolitan denmark
DOM|DO|214|Dominican Republic|🇩🇴|dominicana|domrep|haiti espanol|quisqueya|republica de santo domingo|republica dominicana|santo domingo
DZA|DZ|012|Algeria|🇩🇿|peoples democratic republic of algeria|الجزائر|الجزاير|الجمهورية الجزائرية الديمقراطية الشعبية|الدزاير|دزاير
ECU|EC|218|Ecuador|🇪🇨|ecuadorian state|el ecuador|estado ecuatoriano|republic of ecuador|republic of equator|republic of the equator|republica del ecuador
EGY|EG|818|Egypt|🇪🇬|arab rep egypt|arab republic of egypt|rep egypt|republic of egypt|جمهورية مصر العربية|مصر
ERI|ER|232|Eritrea|🇪🇷|ertra|hagere ertra|hagere iertra|iertra|iritriya|state of eritrea|إرتريا|إريتريا|ارتريا|ارتيريا|اريتريا|دولة إرتريا|دولة إريتريا|ሃገረ ኤርትራ|ኤርትራ
ESH|EH|732|Western Sahara|🇪🇭|southern provinces|spanish sahara|west sahara
ESP|ES|724|Spain|🇪🇸|espana|estado espanol|kingdom of spain|reino de espana
EST|EE|233|Estonia|🇪🇪|eesti|eesti noukogude sotsialistlik vabariik|eesti vabariik|estland|republic of estonia
ETH|ET|231|Ethiopia|🇪🇹|federal democratic republic of ethiopia|ityopiya|yeityopiya federalawi demokrasiyawi ripeblik|yeityopiya hizbawi dimokrasiyawi ripublik|ኢትዮጵያ|የኢትዮጵያ ፌዴራላዊ ዴሞክራሲያዊ ሪፐብሊክ
FIN|FI|246|Finland|🇫🇮|republic of finland|republiken finland|suomen tasavalta|suomi
FJI|FJ|242|Fiji|🇫🇯|fiji ganarajya|matanitu ko viti|matanitu tugalala o viti|republic of fiji|republic of the fiji islands|viti
FLK|FK|238|Falkland Islands (Malvinas)|🇫🇰|colony of the falkland islands|falkland islands|falklands|islas malvinas|malvinas|malvinas islands
FRA|FR|250|France|🇫🇷|fr|french republic|la france|la republique francaise|lhexagone|republique francaise
FRO|FO|234|Faroe Islands|🇫🇴|faer oer|færø|faeroe is|faeroe islands|faeroe isles|færøerne|faeroes|far oer|faroe island|faroe isles|faroes|faroese islands|føroya|føroyar|føroyum
FSM|FM|583|Micronesia (Federated States of)|🇫🇲|fed sts micronesia|fed sts of micronesia|federated states of micronesia|federated states of micronesia fsm|micronesia
GAB|GA|266|Gabon|🇬🇦|gabonese republic|la republique gabonaise|le gabon|republique du gabon|republique gabonaise
GBR|GB|826|United Kingdom of Great Britain and Northern Ireland|🇬🇧|britain|england|great britain|great britain and northern ireland|northern ireland|scotland|uk|united kingdom|wales
GEO|GE|268|Georgia|🇬🇪|georgia country|republic of georgia|sakartvelo|қырҭтәыла|საქართველო|საქართველოს რესპუბლიკა
GGY|GG|831|Guernsey|🇬🇬|bailiwick of guernsey|bailliage de guernesey|bailliage de guernesi|giernesi|great britain guernsey|guernesey|lisia
GHA|GH|288|Ghana|🇬🇭|republic of ghana
GIB|GI|292|Gibraltar|🇬🇮|rock of gibraltar
GIN|GN|324|Guinea|🇬🇳|guinee|guinee conakry|republic of guinea|republique de guinee
GLP|GP|312|Guadeloupe|🇬🇵
GMB|GM|270|Gambia|🇬🇲|islamic republic of the gambia|republic of the gambia
GNB|GW|624|Guinea-Bissau|🇬🇼|guine bissau|republic of guinea bissau|republica da guine bissau
GNQ|GQ|226|Equatorial Guinea|🇬🇶|guine equatorial|guinea ecuatorial|guinea espanola|guinee equat|guinee equatoriale|la republique de guinee equatoriale|posesiones espanolas del golfo de guinea|provincia de la guinea ecuatorial|republic of equatorial guinea|republica da guine equatorial|republica de guinea ecuatorial|territorios espanoles del golfo de guinea
GRC|GR|300|Greece|🇬🇷|ellada|ellas|elliniki dhimokratia|elliniki dimokratia|greek republic|hellas|hellas greece|hellenic republic|vasilion tis ellados|δημοκρατια της ελλαδας|δημοκρατια της ελλαδος|ελλαδα|ελλας|ελλας ελλαδα|ελληνικη δημοκρατια
GRD|GD|308|Grenada|🇬🇩
GRL|GL|304|Greenland|🇬🇱|kalaallit nunaat
GTM|GT|320|Guatemala|🇬🇹|republic of guatemala|republica de guatemala
GUF|GF|254|French Guiana|🇬🇫|fr 973|guiana|guiana france|guyane|guyane francaise|gwiyann|gwiyann franse|lagwiyann
GUM|GU|316|Guam|🇬🇺|guahan|guam usa|islan guahan|island of guam|territory of guam
GUY|GY|328|Guyana|🇬🇾|co operative republic of guyana|republic of guyana
HKG|HK|344|Hong Kong|🇭🇰|hksar|hong kong sar|hong kong special administrative region|hong kong special administrative region of the peoples republic of china|hongkong
HMD|HM|334|Heard Island and McDonald Islands|🇭🇲|heard|heard & mcdonald islands|heard and macdonald islands|heard island|himi|mcdonald|mcdonald island|territory of heard island and mcdonald islands
HND|HN|340|Honduras|🇭🇳|guaymuras|higueras|honduran republic|republic of honduras|republica de honduras
HRV|HR|191|Croatia|🇭🇷|hrvatska|republic of croatia|republika hrvatska
HTI|HT|332|Haiti|🇭🇹|ayiti|haitian republic|la republique dhaiti|repiblik d ayiti|republic of haiti|republique dhaiti
HUN|HU|348|Hungary|🇭🇺|a magyar koztarsasag|a magyar nepkoztarsasag|harmadik magyar koztarsasag|magyar koztarsasag|magyar nepkoztarsasag|magyarorszag|mo
IDN|ID|360|Indonesia|🇮🇩|negara kesatuan republik indonesia|nkri|republic of indonesia|republik indonesia
IMN|IM|833|Isle of Man|🇮🇲|ellan vannin|i man|i mann|i mannin|isle of mann|mann|mannin|manx
IND|IN|356|India|🇮🇳|al hind|bharat|bharat ganarajya|bharata|bharatvarsh|hindoostan|hindustan|indostan|republic of india|tenjiku|tianzhu|आर्यवर्त|इंडिया|इण्डिया|भारत|भारत गणराज्य|भारतवर्ष|हिंदुस्तान|हिन्दुस्तान|हिन्दोस्तान
IOT|IO|086|British Indian Ocean Territory|🇮🇴|biot
IRL|IE|372|Ireland|🇮🇪|eire|hibernia|irish republic|poblacht na heireann|republic of ireland|southern ireland
IRN|IR|364|Iran (Islamic Republic of)|🇮🇷|iran|islamic rep iran|islamic republic of iran|persia|ایران|ایرانزمین|پارس|جمهوری اسلامی ايران|جمهوری اسلامی ایران|كشور شاهنشاهی ايران
IRQ|IQ|368|Iraq|🇮🇶|eraq|iraqe|komar i eraq|republic of iraq|الجمهورية العراقية|العراق|جمهورية العراق|عراق|عێراق
ISL|IS|352|Iceland|🇮🇸|icelandic republic|island|lyðveldið island|republic of iceland|ysland
ISR|IL|376|Israel|🇮🇱|erez yisrael|medinat yisrael|state of israel|yisrael|ישראל|מדינת ישראל
ITA|IT|380|Italy|🇮🇹|il bel paese|italia|italian republic|repubblica italiana|republic of italy
JAM|JM|388|Jamaica|🇯🇲|commonwealth of jamaica|jamieka|jomieka|jumieka
JEY|JE|832|Jersey|🇯🇪|bailliage de jerri|bailliage de jersey|balliwick of jersey|i iersey|i jersey|iersey|iersey i|isle of jersey|jerri|jersey i|jersey island
JOR|JO|400|Jordan|🇯🇴|giordania|hashemite kingdom of jordan|kingdom of jordan|state of jordan|yarden|الأردن|الاردن|المملكة الأردنية الهاشمية|المملكة الاردنية الهاشمية
JPN|JP|392|Japan|🇯🇵|state of japan|あきつしま|おおやしま|しきしま|ジャパン|しんしゅう|にっぽん|にっぽんこく|にほん|にほんこく|ひいずるくに|ふそう|大八州|扶木之地|扶桑|扶桑国|敷島|日出る国|日本|榑木之地|瑞穂国|神州|秋津島|葦原中国
KAZ|KZ|398|Kazakhstan|🇰🇿|qazaqstan|qazaqstan respublikasy|republic of kazakhstan|казахстан|қазақстан|қазақстан республикасы|республика казахстан|рк
KEN|KE|404|Kenya|🇰🇪|jamhuri ya kenya|republic of kenya
KGZ|KG|417|Kyrgyzstan|🇰🇬|kyrgyz republic|kyrgyz respublikasy|kyrgyzstan respublikasy|кр|кыргыз республикасы|кыргызстан
KHM|KH|116|Cambodia|🇰🇭|camboya|campuchia|kambodzha|kamboja|kampuchea|kingdom of cambodia|កម្ពុជា|ព្រះរាជាណាចក្រកម្ពុជា
KIR|KI|296|Kiribati|🇰🇮|republic of kiribati
KNA|KN|659|Saint Kitts and Nevis|🇰🇳|federation of saint christopher and nevis|federation of saint kitts and nevis|kitts & nevis|nevis|saint christopher|saint christopher and nevis|saint kitts
KOR|KR|410|Republic of Korea|🇰🇷|korea|korea republic|korea republic of|korea south|rep korea|s korea|south korea|taehan minguk|남조선|남한|대한|대한민국|코리아|한국
KWT|KW|414|Kuwait|🇰🇼|state of kuwait|الكويت|دولة الكويت
LAO|LA|418|Lao People's Democratic Republic|🇱🇦|laos|sathalanalat paxathipatai paxaxon lao|ສາທາລະນະລັດ ປະຊາທິປະໄຕ ປະຊາຊົນລາວ|ປະເທດລາວ|ລາວ
LBN|LB|422|Lebanon|🇱🇧|lebanese republic|republic of lebanon|state of lebanon|الجمهورية اللبنانية|لبنان
LBR|LR|430|Liberia|🇱🇷|liber|republic of liberia
LBY|LY|434|Libya|🇱🇾|state of libya|الجماهيرية العربية الليبية الشعبية الإشتراكية|الجمهورية الليبية|الليبي|الليبية|الليبين|دولة ليبيا|ليببيا|ليبي|ليبيا|ليبية
LCA|LC|662|Saint Lucia|🇱🇨|hewanorra|iyonola
LIE|LI|438|Liechtenstein|🇱🇮|furstentum lichtenstein|furstentum liechtenstein|principality of liechtenstein
LKA|LK|144|Sri Lanka|🇱🇰|ceylan|ceylon|democratic socialist republic of sri lanka|ilankaic cananayaka cocalicak kutiyarcu|lankava|prajatantravadi samajavadi janarajaya sri lanka|serendib|srilanka|taprobane|இலங்கை|இலங்கை சனநாயக சோசலிசக் குடியரசு|இலங்கை சனநாயக சோஷலிசக் குடியரசு|ஈழம்|சிலோன்|ලංකාව|ශ්රී ලංකා ප්රජාතන්ත්රවාදී සමාජවාදී ජනරජය|ශ්රී ලංකාව|ශ්‍රී ලංකාව
LSO|LS|426|Lesotho|🇱🇸|kingdom of lesotho|mmuso wa lesotho|mountain kingdom
LTU|LT|440|Lithuania|🇱🇹|lietuva|lietuvos respublika|republic of lithuania
LUX|LU|442|Luxembourg|🇱🇺|grand duche|grand duche de luxembourg|grand duchy of luxembourg|großherzogtum luxemburg|groussherzogtum letzebuerg|le grand duche de luxembourg|letzebuerg|letzebuerger land|lux|luxemburg
LVA|LV|428|Latvia|🇱🇻|latveja|latvejas republika|latvian republic|latvija|latvijas republika|letmо|letmо vabamо|republic of latvia
MAC|MO|446|Macao|🇲🇴|aomen|macao sar|macao special administrative region|macao special administrative region of the peoples republic of china|macau|macau rae da china|macau sar|macau special administrative region|macau special administrative region of the peoples republic of china|raem|regiao administrativa especial de macau|regiao administrativa especial de macau da republica popular da china|中國澳門特別行政區|澳門
MAF|MF|663|Saint Martin (French Part)|🇲🇫|collectivite de saint martin|collectivity of saint martin|saint martin|saint martin antilles francaises|saint martin france
MAR|MA|504|Morocco|🇲🇦|kingdom of morocco|المغرب|المملكة المغربية|ⴰⵎⵓⵔ ⵏ ⵡⴰⴽⵓⵛ|ⴰⵎⵕⵕⵓⴽ|ⵍⵎⵕⵕⵓⴽ|ⵍⵎⵖⵔⵉⴱ|ⵜⴰⴳⵍⴷⵉⵜ ⵏ ⵍⵎⵖⵔⵉⴱ
MCO|MC|492|Monaco|🇲🇨|fort hercule|la principaute de monaco|monaco rattachee au district de menton en 1793|munegu|principality and diocese of monaco|principality of monaco|principatu de munegu|principaute de monaco
MDA|MD|498|Republic of Moldova|🇲🇩|moldavia|moldova|moldova republic of|moldova republica|r moldova|rep moldova|republica moldova|молдова
MDG|MG|450|Madagascar|🇲🇬|la republique de madagascar|madagasikara|repoblikani madagasikara|republic of madagascar|republique de madagascar
MDV|MV|462|Maldives|🇲🇻|dhivehi raajjeyge jumhooriyyaa|republic of maldives|ދިވެހި ރާއްޖެ|ދިވެހިރާއްޖެ|ދިވެހިރާއްޖޭގެ ޖުމުހޫރިއްޔާ|ދިވެހިރާއްޖޭގެ ޖުމްހޫރިއްޔާ
MEX|MX|484|Mexico|🇲🇽|estados unidos mejicanos|estados unidos mexicanos|mejico|mexican republic|mexican united states|mexihco|mexihko|mexika sentik wexteyowalko|mexiko|mexko|mexko axkayotl|mexko tlalli|nueva espana|republica mejicana|republica mexicana|united mexican states|united states of mexico
MHL|MH|584|Marshall Islands|🇲🇭|aelon kein ad|aolepan aorokin majel|jolet jen anij|majel|majol|republic of the marshall islands
MKD|MK|807|North Macedonia|🇲🇰|former yugoslav republic of macedonia|fyr macedonia|fyrom|irjm|ish republika jugosllave e maqedonise|macedonia|macedonia former yugoslav republic of|macedonia fyr|maqedoni|maqedonia|maqedonia e veriut|republic of macedonia|republic of north macedonia|republika e maqedonise|republika e maqedonise se veriut|македонија|република македонија|република северна македонија|рм|рсм|северна македонија
MLI|ML|466|Mali|🇲🇱|maali|republic of mali
MLT|MT|470|Malta|🇲🇹|malta island|repubblika ta malta|republic of malta
MMR|MM|104|Myanmar|🇲🇲|burma|pyidaungzu myanma naingngandaw|pyidaungzu thammada myanma naingngandaw|republic of the union of myanmar|union of burma|ပြည်ထောင်စု မြန်မာနိုင်ငံ|ပြည်ထောင်စု မြန်မာနိုင်ငံတော်|ပြည်ထောင်စု သမ္မတ မြန်မာနိုင်ငံ|ပြည်ထောင်စု သမ္မတ မြန်မာနိုင်ငံတော်|ပြည်ထောင်စုမြန်မာနိုင်ငံတော်|ပြည်ထောင်စုသမ္မတမြန်မာနိုင်ငံ|ပြ‌ည်ထောင်စုသမ္မတမြန်မာနိုင်ငံ|ပြည်ထောင်စုသမ္မတမြန်မာနိုင်ငံတော်|ဗမာပြည်|မြန်မာ|မြန်မာနိုင်ငံ|မြန်မာနိုင်ငံတော်|မြန်မာပြည်
MNE|ME|499|Montenegro|🇲🇪|crna cora|црна гора
MNG|MN|496|Mongolia|🇲🇳|bugd nayramdah mongol ard uls|mongol uls|state of mongolia|монгол|монгол улс|ᠮᠤᠩᠭᠤᠯ ᠤᠯᠤᠰ
MNP|MP|580|Northern Mariana Islands|🇲🇵|cnmi|commonwealth of the northern maria islands|commonwealth of the northern mariana islands|northern marianas|notte marianas|sankattan siha na islas marianas
MOZ|MZ|508|Mozambique|🇲🇿|mocambique|republic of mozambique|republica de mocambique
MRT|MR|478|Mauritania|🇲🇷|islamic republic of mauritania|الجمهورية الإسلامية الموريتانية|موريتانيا
MSR|MS|500|Montserrat|🇲🇸|island of montserrat
MTQ|MQ|474|Martinique|🇲🇶|territorial collectivity of martinique
MUS|MU|480|Mauritius|🇲🇺|ile maurice|la republique de maurice|maurice|moris|republic of mauritius|republique de maurice
MWI|MW|454|Malawi|🇲🇼|republic of malawi
MYS|MY|458|Malaysia|🇲🇾|federation of malaysia|malaysia federation|negara seberang tambak|persekutuan malaysia
MYT|YT|175|Mayotte|🇾🇹|departement de mayotte|departement region de mayotte|department of mayotte
NAM|NA|516|Namibia|🇳🇦|republic of namibia
NCL|NC|540|New Caledonia|🇳🇨|caledonie|kanaky|kanaky nouvelle caledonie|nouvelle caledonie|territoire de la nouvelle caledonie et dependances|territoire des nouvelle caledonie et dependances|territory of new caledonia and dependencies
NER|NE|562|Niger|🇳🇪|jamhuriyar nijar|nijar|republic niger|republic of niger|republic of the niger
NFK|NF|574|Norfolk Island|🇳🇫|norfolk island australia|norfolk island other territories|norfolk island other territories australia|territory of norfolk island
NGA|NG|566|Nigeria|🇳🇬|federal republic of nigeria|naija
NIC|NI|558|Nicaragua|🇳🇮|republic of nicaragua|republica de nicaragua
NIU|NU|570|Niue|🇳🇺
NLD|NL|528|Kingdom of the Netherlands|🇳🇱|hollandt|kingdom of netherlands|koninkrijk der nederlanden|nederland|nederlanden|nederlandt|netherlands|netherlands kingdom of the
NOR|NO|578|Norway|🇳🇴|kingdom of norway|kongeriket noreg|kongeriket norge|noreg|norge
NPL|NP|524|Nepal|🇳🇵|bal bo|bal poi yul|bal yul|balbo|balpo|balpo yul|nipal|sanghiya loktantrik ganatantra nepal|नेपाल|संघिय लोकतान्त्रिक गणतन्त्र नेपाल|संघिय लोकतान्त्रिक गणतन्त्रात्मक नेपाल|संघीय लोकतान्त्रिक गणतन्त्र नेपाल
NRU|NR|520|Naoero|🇳🇷|nauru|pleasant island|republic of naoero|republic of nauru
NZL|NZ|554|New Zealand|🇳🇿|aotearoa|aotearoa new zealand|dominion of new zealand
OMN|OM|512|Oman|🇴🇲|sultanate of oman|uman|سلطنة عمان|عمان
PAK|PK|586|Pakistan|🇵🇰|hoi quoc|islamic republic of pakistan|republic of pakistan|tay hoi|اسلامی جمہوریہ پاکستان|باکستان|پاکستان
PAN|PA|591|Panama|🇵🇦|republic of panama|republica de panama
PCN|PN|612|Pitcairn|🇵🇳|occas island|pisskern aliеn|pitcairn henderson ducie and oeno islands|pitcairn island|pitcairn islands|pitkern ailen
PER|PE|604|Peru|🇵🇪|piruw|piruw ripuwlika|republic of peru|republica del peru
PHL|PH|608|Philippines|🇵🇭|philippine islands|republic of the philippines
PLW|PW|585|Palau|🇵🇼|belau|peeloo|pelew|pelew islands|pellew|republic of belau|republic of palau|パラオ|パラオ共和国
PNG|PG|598|Papua New Guinea|🇵🇬|independent state of papua new guinea|papua niugini
POL|PL|616|Poland|🇵🇱|polska|republic of poland|rzeczpospolita polska
PRI|PR|630|Puerto Rico|🇵🇷|boriken|borinquen|boriquen|commonwealth of puerto rico|estado libre asociado de puerto rico|free associated state of puerto rico|isla del encanto|island of enchantment|isle of enchantment|mancomunidad de puerto rico|porto rico|territorio de puerto rico|territorio estadounidense de puerto rico|territory of porto rico|territory of puerto rico
PRK|KP|408|Democratic People's Republic of Korea|🇰🇵|choson minjujuui inmin konghwaguk|dpr korea|dprk|korea democratic peoples republic of|n korea|north korea|공화국|북조선|북한|조선|조선민주주의인민공화국
PRT|PT|620|Portugal|🇵🇹|republica portuguesa
PRY|PY|600|Paraguay|🇵🇾|paraguai|republic of paraguay|republica del paraguay|teta paraguai
PSE|PS|275|State of Palestine|🇵🇸|palestine|palestine state of|palestinian authority|palestinian national authority|palestinian territory|west bank and gaza|أراضي فلسطينية|الأراضي الفلسطينية|الدولة الفلسطينية|السلطة الفلسطينية|السلطة الوطنية الفلسطينية|الضفة الغربية وقطاع غزة|دولة فلسطين|فلسطين
PYF|PF|258|French Polynesia|🇵🇫|f oh|french establishments in oceania|french oceania|french settlements in oceania|polynesie francaise|territoire de la polynesie francaise|territory of french polynesia
QAT|QA|634|Qatar|🇶🇦|state of qatar|إمارة قطر|دولة قطر|قطر
REU|RE|638|Réunion|🇷🇪|ile bourbon|ile de la reunion|la reunion|re|region reunion|reunion island
ROU|RO|642|Romania|🇷🇴
RUS|RU|643|Russian Federation|🇷🇺|federation of russia|russia|россииская федерация|россия|рф
RWA|RW|646|Rwanda|🇷🇼|igihugu cyimisozi igihumbi|jamhuri ya rwanda|la republique du rwanda|land of a thousand hills|republic of rwanda|republika yu rwanda|republique du rwanda|republique rwandaise|repubulika yu rwanda|u rwanda
SAU|SA|682|Saudi Arabia|🇸🇦|kingdom of saudi arabia|الدولة السعودية|الدوله السعوديه|السعودية|السعوديه|العربية السعودية|المملكة|المملكة السعودية|المملكة العربية|المملكة العربية السعودية|المملكه|المملكه العربيه السعوديه|بلاد الحرمين الشريفين|دولة آل سعود|سعودية|سعوديه|منبع الرسالة|مهبط الوحي
SDN|SD|729|Sudan|🇸🇩|al sudan|as sudan|north sudan|republic of sudan|republic of the sudan|soudan|السودان|جمهورية السودان
SEN|SN|686|Senegal|🇸🇳|la republique du senegal|republic of senegal|republique du senegal|sen|senegaal
SGP|SG|702|Singapore|🇸🇬|garden city|lion city|republic of singapore|republik singapura|singapore city|singapura|spore|சிங்கப்பூர்|சிங்கப்பூர் குடியரசு|சிங்கை|ஸிங்கபூர்
SGS|GS|239|South Georgia and the South Sandwich Islands|🇬🇸|falkland islands dependencies|sgssi|south georgia|south georgia & south sandwich islands|south sandwich islands
SHN|SH|654|Saint Helena|🇸🇭|ascension|saint helena and dependencies|saint helena ascension and tristan da cunha|tristan da cunha
SJM|SJ|744|Svalbard and Jan Mayen Islands|🇸🇯|jan mayen|svalbard|svalbard and jan mayen|svalbard og jan mayen
SLB|SB|090|Solomon Islands|🇸🇧
SLE|SL|694|Sierra Leone|🇸🇱|republic of sierra leone
SLV|SV|222|El Salvador|🇸🇻|republic of el salvador|republica de el salvador|salvador
SMR|SM|674|San Marino|🇸🇲|most serene republic of san marino|repubblica di san marino|serenissima repubblica di san marino
SOM|SO|706|Somalia|🇸🇴|as sumal|federal republic of somalia|jamhuuriyadda federaalka soomaaliya|jamhuuriyadda soomaaliyeed|soomaaliya|soomaaliyeey toosoo|الصومال|جمهورية الصومال|جمهورية الصومال الديموقراطية|جمهورية الصومال الفيدرالية|صومال
SPM|PM|666|Saint Pierre and Miquelon|🇵🇲|collectivite territoriale de saint pierre et miquelon|miquelon|saint pierre|saint pierre et miquelon|territorial collectivity of saint pierre and miquelon
SRB|RS|688|Serbia|🇷🇸|republic of serbia|republika srbija|република србија|србија
SSD|SS|728|South Sudan|🇸🇸|republic of south sudan|southern sudan
STP|ST|678|Sao Tome and Principe|🇸🇹|democratic republic of sao tome and principe|principe|republica democratica de sao tome e principe|sao tome|sao tome e principe|sao tome og principe
SUR|SR|740|Suriname|🇸🇷|dutch guiana|republic of surinam|republic of suriname|republiek suriname|surinam|surrinam
SVK|SK|703|Slovakia|🇸🇰|slovak republic|slovenska republika|slovensko
SVN|SI|705|Slovenia|🇸🇮|republic of slovenia|republika slovenija|slovenija
SWE|SE|752|Sweden|🇸🇪|kingdom of sweden|konungadomet sverige|konungariket sverige|kungadomet sverige|kungariket sverige|sverige|swedish kingdom
SWZ|SZ|748|Eswatini|🇸🇿|kingdom of eswatini|kingdom of swaziland|swaziland|umbuso weswatini
SXM|SX|534|Sint Maarten (Dutch part)|🇸🇽|country of sint maarten|eilandgebied sint maarten|land sint maarten|saint maarten|saint martin dutch part|sint maarten|sint martin
SYC|SC|690|Seychelles|🇸🇨|la republique des seychelles|repiblik sesel|republic of seychelles|republique des seychelles
SYR|SY|760|Syrian Arab Republic|🇸🇾|surya|syria|الجمهورية العربية السورية|الشام|سوريا|سورية
TCA|TC|796|Turks and Caicos Islands|🇹🇨|caicos|caicos islands|turks|turks & caicos|turks islands
TCD|TD|148|Chad|🇹🇩|la republique du tchad|republic of chad|republique du tchad|tchad|تشاد|جمهورية تشاد
TGO|TG|768|Togo|🇹🇬|la republique togolaise|republique togolaise|togolese republic
THA|TH|764|Thailand|🇹🇭|kingdom of siam|kingdom of thailand|siam|thai|ไทย|ประเทศไทย|ประเทศสยาม|เมืองไทย|ราชอาณาจักรไทย|ราชอาณาจักรสยาม|สยาม
TJK|TJ|762|Tajikistan|🇹🇯|jumhurii tojikiston|republic of tajikistan|тоҷикистон|тҷ|тҷк|ҷт|ҷумҳурии тоҷикистон
TKL|TK|772|Tokelau|🇹🇰|tokelau islands|union islands
TKM|TM|795|Turkmenistan|🇹🇲
TLS|TL|626|Timor-Leste|🇹🇱|democratic republic of timor leste|east timor|republica democratica de timor leste|republika demokratika timor lorosae|timor loro sae|timor lorosae
TON|TO|776|Tonga|🇹🇴|friendly islands|kingdom of tonga|puleanga fakatui o tonga|tonga islands
TTO|TT|780|Trinidad and Tobago|🇹🇹|republic of trinidad and tobago|tobago|trinidad
TUN|TN|788|Tunisia|🇹🇳|republic of tunisia|tunisian republic|الجمهورية التونسية|تونس|تونس الخضراء
TUR|TR|792|Türkiye|🇹🇷|republic of turkey|republic of turkiye|turkey|turkiye cumhuriyeti
TUV|TV|798|Tuvalu|🇹🇻|ellice islands
TWN|TW|158|Taiwan|🇹🇼|chinese republic|chinese taipei|chunghwa minkuo|chunghwa minkwo|conghwaminku|cunghwa minkwo|cyukamingkok|formosa|nanasian|nationalist china|republic of china|republic of china taiwan|roc|taivang|taiwan province of china|taiwan roc|taywan|taywang|teywan|中華民國|中華民國（臺灣）|中華臺北|台灣|臺澎金馬|臺灣
TZA|TZ|834|United Republic of Tanzania|🇹🇿|jamhuri ya muungano wa tanganyika na zanzibar|jamhuri ya muungano wa tanzania|tanzania|tanzania jamhuri ya muungano wa|tanzania united republic of|united republic of tanganyika and zanzibar
UGA|UG|800|Uganda|🇺🇬|jamhuri ya uganda|lulu ya afrika|ouganda|pearl of africa|republic of uganda|ugandah
UKR|UA|804|Ukraine|🇺🇦|ukr|ukraina|ukrainia|ukrayina|вкраіна|украіна
UMI|UM|581|United States Minor Outlying Islands|🇺🇲|us minor outlying islands|us outlying islands|usmoi
URY|UY|858|Uruguay|🇺🇾|eastern republic of uruguay|oriental republic of uruguay
USA|US|840|United States of America|🇺🇸|amelika|amelika hui pu ia|amelika huipuia|amelika mokuaina hui pu ia|america|eeuu|eeuu de america|estados unidos|estados unidos de america|los estados|los estados unidos|los estados unidos de america|mokuaina hui pu ia|union americana|united states|us|us of a|us of america|usa
UZB|UZ|860|Uzbekistan|🇺🇿|ozbek|ozbekiston|ozbekiston respublikasi|republic of uzbekistan|uzbekiston respublikasi
VAT|VA|336|Holy See|🇻🇦|citta del vaticano|civitas vaticana|colle vaticano|papal state|santa sede citta del vaticano|state of vatican city|stato della citta del vaticano|status civitatis vaticanae|status civitatis vaticanæ|vatican|vatican city|vatican city state|vaticano
VCT|VC|670|Saint Vincent and the Grenadines|🇻🇨|grenadines|saint vincent|saint vincent and grenadines
VEN|VE|862|Venezuela (Bolivarian Republic of)|🇻🇪|bolivarian republic of venezuela|br venezuela|estados unidos de venezuela|rb venezuela|republic of venezuela|republica bolivariana de venezuela|republica de venezuela|venezuela
VGB|VG|092|British Virgin Islands|🇻🇬|bvi|virgin islands british|virgin islands of the united kingdom|virgin islands united kingdom
VIR|VI|850|United States Virgin Islands|🇻🇮|american virgin islands|us virgin islands|virgin islands of the united states|virgin islands us
VNM|VN|704|Viet Nam|🇻🇳|chxhcn viet nam|chxhcnvn|cong hoa xa hoi chu nghia viet nam|socialist republic of viet nam|socialist republic of vietnam|vietnam
VUT|VU|548|Vanuatu|🇻🇺|la republique du vanuatu|republic of vanuatu|republique de vanuatu|ripablik blong vanuatu
WLF|WF|876|Wallis and Futuna Islands|🇼🇫|collectivite des iles wallis et futuna|emeni simete|futuna|iles wallis et futuna|makape papilio|territoire de wallis et futuna|territoire des iles wallis et futuna|wallis|wallis & futuna|wallis et futuna
WSM|WS|882|Samoa|🇼🇸|independent state of samoa|malo saoloto tutoatasi o samoa|samoa i sisifo|western samoa
YEM|YE|887|Yemen|🇾🇪|rep yemen|republic of yemen|الجمهورية اليمنية|اليمن|دولة اليمن
ZAF|ZA|710|South Africa|🇿🇦|aferika borwa|aforika borwa|afrika boroa|afrika borwa|afrika dzonga|afurika tshipembe|emzantsi afrika|iningizimu afrika|iriphabhulikhi ye ningizimu afrika|iriphabhulikhi yeningizimu afrika|iriphabhuliki yase ningizimu afrika|iriphabliki yasemzantsi afrika|iriphabliki yaseningizimu afrika|iriphabliki yom zantsi afrika|isewula afrika|repabliki ya afrika borwa|rephaboliki ya aforika borwa|rephaboliki ya afrika borwa|republic of south africa|republiek van suid afrika|riphabliki ra afrika dzonga|rsa|suid afrika|umzansi|umzantsi afrika|unie van suid afrika|union of south africa
ZMB|ZM|894|Zambia|🇿🇲|northern rhodesia|republic of zambia
ZWE|ZW|716|Zimbabwe|🇿🇼|ezimbabwe|izimbabwe|republic of zimbabwe|rhodesia|southern rhodesia|zimbabwe rhodesia|zimbagwe
XAC|||Aksai Chin
XAP|||Arunachal Pradesh
XBT|||Bir Tawil
XHT|||Halaib Triangle
XIT|||Ilemi Triangle
XJK|||Jammu and Kashmir
XKX|XK||Kosovo|kosova|republic of kosovo
`;

/**
 * A name as the lookup compares it (country-iso-search's `sanitize`): lowercase, without Latin
 * and Arabic diacritics, apostrophes and `.` `,` `(` `)` `[` `]`; `&` is `and`, hyphens and
 * dashes are spaces, `st` is `saint`, and `the` is dropped at the start and after `,` or `(`
 * (`'Korea (the Republic of)'`). `'Côte d’Ivoire'` → `'cote divoire'`.
 *
 * The character classes are `\u` escapes so that the bundle parses on a page without a UTF-8
 * charset.
 */
export function sanitize(s: string): string {
  return (
    s
      .normalize('NFD')
      // Combining diacritical marks.
      .replace(/[\u0300-\u036F]/g, '')
      .normalize('NFC')
      .toLowerCase()
      // Arabic diacritics.
      .replace(/[\u064B-\u065F]/g, '')
      // Apostrophes, straight and curly, primes and the backtick.
      .replace(/['\u2018\u2019\u02BB\u02BC\u02BD\u02C8\u2032`]/g, '')
      .replace(/&/g, ' and ')
      .replace(/([,(])\s*the\b/g, '$1')
      .replace(/[.(),[\]]/g, '')
      // Hyphen, en dash, em dash.
      .replace(/[-\u2013\u2014]/g, ' ')
      .replace(/\bst\b/g, 'saint')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^the\s+/, '')
  );
}

interface Index {
  readonly alpha3: ReadonlySet<string>;
  readonly alpha2: ReadonlyMap<string, string>;
  readonly m49: ReadonlyMap<string, string>;
  readonly names: ReadonlyMap<string, string>;
}

let index: Index | undefined;

/** The lookup maps, built from the table on first use (about 2,000 keys). */
function indexOf(): Index {
  if (index) return index;
  const alpha3 = new Set<string>();
  const alpha2 = new Map<string, string>();
  const m49 = new Map<string, string>();
  const names = new Map<string, string>();
  for (const line of TABLE.split('\n')) {
    if (line === '') continue;
    const [iso3, iso2, numeric, name, ...aliases] = line.split('|') as [
      string,
      string,
      string,
      string,
      ...string[],
    ];
    alpha3.add(iso3);
    if (iso2) alpha2.set(iso2, iso3);
    if (numeric) m49.set(numeric, iso3);
    names.set(sanitize(name), iso3);
    for (const alias of aliases) names.set(sanitize(alias), iso3);
  }
  return (index = { alpha3, alpha2, m49, names });
}

/**
 * The ISO 3166-1 alpha-3 code of a country given by name or code, or `undefined` when nothing
 * matches (country-iso-search's `lookupAlpha3`). Accepted, in this order:
 *
 * - a UN M49 number (`'250'`, `'04'`),
 * - an alpha-2 code (`'FR'`), an alpha-3 code (`'FRA'`), in any case,
 * - a name or an alias, compared after {@link sanitize}: `'France'`, `'Ivory Coast'`,
 *   `'Korea, Republic of'`, `'Türkiye'`, `'🇯🇵'`.
 *
 * Matching is exact after sanitizing: `'Republic of Franc'` matches nothing.
 */
export function countryNameToIso3(input: string): string | undefined {
  const s = input.trim();
  if (s === '') return undefined;
  const { alpha3, alpha2, m49, names } = indexOf();
  if (/^\d+$/.test(s)) {
    const hit = m49.get(String(parseInt(s, 10)).padStart(3, '0'));
    if (hit) return hit;
  }
  if (/^[A-Za-z]{2}$/.test(s)) {
    const hit = alpha2.get(s.toUpperCase());
    if (hit) return hit;
  }
  if (/^[A-Za-z]{3}$/.test(s) && alpha3.has(s.toUpperCase())) return s.toUpperCase();
  return names.get(sanitize(s));
}
