import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, '../src/core/data');

const stationsData = JSON.parse(readFileSync(resolve(dataDir, 'stations.json'), 'utf8'));
const connectionsData = JSON.parse(readFileSync(resolve(dataDir, 'connections.json'), 'utf8'));

// Take base 124 stations (Yellow, Blue, Violet)
const stations = stationsData.stations.slice(0, 124);
// Take base 125 edges (Yellow, Blue, Violet)
const edges = connectionsData.edges.slice(0, 125);

// Reset New Delhi and Dwarka Sec 21 to remove unserved Orange line
const nd = stations.find(s => s.id === 'NEW_DELHI');
if (nd) { nd.lines = ['YELLOW']; nd.isInterchange = false; }
const dw21 = stations.find(s => s.id === 'DWARKA_SEC_21');
if (dw21) { dw21.lines = ['BLUE']; dw21.isInterchange = false; }

function updateStation(id, updates) {
  const idx = stations.findIndex(s => s.id === id);
  if (idx === -1) throw new Error('Station not found: ' + id);
  stations[idx] = { ...stations[idx], ...updates };
}

function addStation(station) {
  if (stations.find(s => s.id === station.id)) {
    throw new Error('Duplicate station ID: ' + station.id);
  }
  stations.push(station);
}

function addEdge(edge) {
  const k1 = edge.from + '#' + edge.to + '#' + edge.line;
  const k2 = edge.to + '#' + edge.from + '#' + edge.line;
  const dup = edges.find(e =>
    (e.from+'#'+e.to+'#'+e.line === k1) || (e.from+'#'+e.to+'#'+e.line === k2) ||
    (e.to+'#'+e.from+'#'+e.line === k1) || (e.to+'#'+e.from+'#'+e.line === k2)
  );
  if (dup) throw new Error('Duplicate edge: ' + edge.from + ' to ' + edge.to + ' [' + edge.line + ']');
  edges.push(edge);
}

const E = (from, to, line) => ({ from, to, line, travelTimeSeconds: 120, isEstimated: true });

// ── Update existing interchange stations ──
updateStation('KASHMERE_GATE', { lines: ['YELLOW', 'VIOLET', 'RED'], isInterchange: true });
updateStation('HAUZ_KHAS',     { lines: ['YELLOW', 'MAGENTA'], isInterchange: true });
updateStation('KALKAJI_MANDIR',{ lines: ['VIOLET', 'MAGENTA'], isInterchange: true });
updateStation('BOTANICAL_GARDEN', { lines: ['BLUE', 'MAGENTA'], isInterchange: true });
updateStation('JANAKPURI_WEST',{ lines: ['BLUE', 'MAGENTA'], isInterchange: true });
updateStation('RAJOURI_GARDEN',{ lines: ['BLUE', 'PINK'], isInterchange: true });
updateStation('AZADPUR',       { lines: ['YELLOW', 'PINK'], isInterchange: true });
updateStation('KARKARDUMA',    { lines: ['BLUE', 'PINK'], isInterchange: true });
updateStation('LAJPAT_NAGAR',  { lines: ['VIOLET', 'PINK'], isInterchange: true });
updateStation('INA',           { name: 'Dilli Haat - INA', nameHindi: 'दिल्ली हाट - आईएनए', lines: ['YELLOW', 'PINK'], isInterchange: true });
updateStation('KIRTI_NAGAR',   { lines: ['BLUE', 'GREEN'], isInterchange: true });
updateStation('ANAND_VIHAR',   { name: 'Anand Vihar ISBT', nameHindi: 'आनंद विहार आईएसबीटी', lines: ['BLUE', 'PINK'], isInterchange: true });
updateStation('MAYUR_VIHAR_1', { name: 'Mayur Vihar Phase-1', nameHindi: 'मयूर विहार फेज-1', lines: ['BLUE', 'PINK'], isInterchange: true });

// ── RED LINE new stations ──
const redStations = [
  { id:'RITHALA', name:'Rithala', nameHindi:'रिठाला', lines:['RED'], coordinates:{lat:28.7209,lng:77.1071}, isInterchange:false, zone:1 },
  { id:'ROHINI_WEST', name:'Rohini West', nameHindi:'रोहिणी वेस्ट', lines:['RED'], coordinates:{lat:28.7163,lng:77.1147}, isInterchange:false, zone:1 },
  { id:'ROHINI_EAST', name:'Rohini East', nameHindi:'रोहिणी ईस्ट', lines:['RED'], coordinates:{lat:28.7112,lng:77.1249}, isInterchange:false, zone:1 },
  { id:'PITAMPURA', name:'Pitampura', nameHindi:'पीतमपुरा', lines:['RED'], coordinates:{lat:28.7036,lng:77.1329}, isInterchange:false, zone:1 },
  { id:'KOHAT_ENCLAVE', name:'Kohat Enclave', nameHindi:'कोहाट एन्क्लेव', lines:['RED'], coordinates:{lat:28.6962,lng:77.1385}, isInterchange:false, zone:1 },
  { id:'NETAJI_SUBHASH_PLACE', name:'Netaji Subhash Place', nameHindi:'नेताजी सुभाष प्लेस', lines:['RED','PINK'], coordinates:{lat:28.6959,lng:77.1525}, isInterchange:true, zone:1 },
  { id:'KESHAV_PURAM', name:'Keshav Puram', nameHindi:'केशव पुरम', lines:['RED'], coordinates:{lat:28.6897,lng:77.1624}, isInterchange:false, zone:1 },
  { id:'KANHAIYA_NAGAR', name:'Kanhaiya Nagar', nameHindi:'कन्हैया नगर', lines:['RED'], coordinates:{lat:28.6823,lng:77.1726}, isInterchange:false, zone:1 },
  { id:'INDERLOK', name:'Inderlok', nameHindi:'इंदरलोक', lines:['RED','GREEN'], coordinates:{lat:28.6730,lng:77.1786}, isInterchange:true, zone:1 },
  { id:'SHASTRI_NAGAR', name:'Shastri Nagar', nameHindi:'शास्त्री नगर', lines:['RED'], coordinates:{lat:28.6673,lng:77.1895}, isInterchange:false, zone:1 },
  { id:'PRATAP_NAGAR', name:'Pratap Nagar', nameHindi:'प्रताप नगर', lines:['RED'], coordinates:{lat:28.6617,lng:77.1989}, isInterchange:false, zone:1 },
  { id:'PUL_BANGASH', name:'Pul Bangash', nameHindi:'पुल बंगश', lines:['RED'], coordinates:{lat:28.6618,lng:77.2080}, isInterchange:false, zone:1 },
  { id:'TIS_HAZARI', name:'Tis Hazari', nameHindi:'तीस हजारी', lines:['RED'], coordinates:{lat:28.6649,lng:77.2172}, isInterchange:false, zone:1 },
  { id:'SHASTRI_PARK', name:'Shastri Park', nameHindi:'शास्त्री पार्क', lines:['RED'], coordinates:{lat:28.6736,lng:77.2432}, isInterchange:false, zone:1 },
  { id:'SEELAMPUR', name:'Seelampur', nameHindi:'सीलमपुर', lines:['RED'], coordinates:{lat:28.6772,lng:77.2565}, isInterchange:false, zone:1 },
  { id:'WELCOME', name:'Welcome', nameHindi:'वेलकम', lines:['RED','PINK'], coordinates:{lat:28.6788,lng:77.2727}, isInterchange:true, zone:1 },
  { id:'SHAHDARA', name:'Shahdara', nameHindi:'शाहदरा', lines:['RED'], coordinates:{lat:28.6725,lng:77.2816}, isInterchange:false, zone:1 },
  { id:'MANSAROVAR_PARK', name:'Mansarovar Park', nameHindi:'मानसरोवर पार्क', lines:['RED'], coordinates:{lat:28.6685,lng:77.2923}, isInterchange:false, zone:1 },
  { id:'JHILMIL', name:'Jhilmil', nameHindi:'झिलमिल', lines:['RED'], coordinates:{lat:28.6638,lng:77.3049}, isInterchange:false, zone:1 },
  { id:'DILSHAD_GARDEN', name:'Dilshad Garden', nameHindi:'दिलशाद गार्डन', lines:['RED'], coordinates:{lat:28.6604,lng:77.3155}, isInterchange:false, zone:1 },
  { id:'SHAHEED_NAGAR', name:'Shaheed Nagar', nameHindi:'शहीद नगर', lines:['RED'], coordinates:{lat:28.6670,lng:77.3285}, isInterchange:false, zone:2 },
  { id:'RAJ_BAGH', name:'Raj Bagh', nameHindi:'राज बाग', lines:['RED'], coordinates:{lat:28.6693,lng:77.3380}, isInterchange:false, zone:2 },
  { id:'MAJOR_MOHIT_SHARMA', name:'Major Mohit Sharma Rajendra Nagar', nameHindi:'मेजर मोहित शर्मा राजेंद्र नगर', lines:['RED'], coordinates:{lat:28.6697,lng:77.3474}, isInterchange:false, zone:2 },
  { id:'SHYAM_PARK', name:'Shyam Park', nameHindi:'श्याम पार्क', lines:['RED'], coordinates:{lat:28.6703,lng:77.3567}, isInterchange:false, zone:2 },
  { id:'MOHAN_NAGAR', name:'Mohan Nagar', nameHindi:'मोहन नगर', lines:['RED'], coordinates:{lat:28.6774,lng:77.3700}, isInterchange:false, zone:2 },
  { id:'ARTHALA', name:'Arthala', nameHindi:'अर्थला', lines:['RED'], coordinates:{lat:28.6838,lng:77.3870}, isInterchange:false, zone:2 },
  { id:'HINDON_RIVER', name:'Hindon River', nameHindi:'हिंडन रिवर', lines:['RED'], coordinates:{lat:28.6822,lng:77.4015}, isInterchange:false, zone:2 },
  { id:'SHAHEED_STHAL', name:'Shaheed Sthal (New Bus Adda)', nameHindi:'शहीद स्थल (नया बस अड्डा)', lines:['RED'], coordinates:{lat:28.6781,lng:77.4145}, isInterchange:false, zone:2 },
];

// ── GREEN LINE new stations ──
const greenStations = [
  { id:'SATGURU_RAM_SINGH_MARG', name:'Satguru Ram Singh Marg', nameHindi:'सतगुरु राम सिंह मार्ग', lines:['GREEN'], coordinates:{lat:28.6556,lng:77.1589}, isInterchange:false, zone:1 },
  { id:'ASHOK_PARK_MAIN', name:'Ashok Park Main', nameHindi:'अशोक पार्क मेन', lines:['GREEN'], coordinates:{lat:28.6640,lng:77.1672}, isInterchange:false, zone:1 },
  { id:'PUNJABI_BAGH', name:'Punjabi Bagh', nameHindi:'पंजाबी बाग', lines:['GREEN'], coordinates:{lat:28.6680,lng:77.1520}, isInterchange:false, zone:1 },
  { id:'PUNJABI_BAGH_WEST', name:'Punjabi Bagh West', nameHindi:'पंजाबी बाग वेस्ट', lines:['GREEN','PINK'], coordinates:{lat:28.6627,lng:77.1378}, isInterchange:true, zone:1 },
  { id:'SHIVAJI_PARK', name:'Shivaji Park', nameHindi:'शिवाजी पार्क', lines:['GREEN'], coordinates:{lat:28.6607,lng:77.1270}, isInterchange:false, zone:1 },
  { id:'MADIPUR', name:'Madipur', nameHindi:'मादीपुर', lines:['GREEN'], coordinates:{lat:28.6617,lng:77.1153}, isInterchange:false, zone:1 },
  { id:'PASCHIM_VIHAR_EAST', name:'Paschim Vihar East', nameHindi:'पश्चिम विहार ईस्ट', lines:['GREEN'], coordinates:{lat:28.6629,lng:77.1031}, isInterchange:false, zone:1 },
  { id:'PASCHIM_VIHAR_WEST', name:'Paschim Vihar West', nameHindi:'पश्चिम विहार वेस्ट', lines:['GREEN'], coordinates:{lat:28.6652,lng:77.0920}, isInterchange:false, zone:1 },
  { id:'PEERAGARHI', name:'Peeragarhi', nameHindi:'पीरागढ़ी', lines:['GREEN'], coordinates:{lat:28.6672,lng:77.0806}, isInterchange:false, zone:1 },
  { id:'UDYOG_NAGAR', name:'Udyog Nagar', nameHindi:'उद्योग नगर', lines:['GREEN'], coordinates:{lat:28.6642,lng:77.0691}, isInterchange:false, zone:1 },
  { id:'MAHARAJA_SURAJMAL_STADIUM', name:'Maharaja Surajmal Stadium', nameHindi:'महाराजा सूरजमल स्टेडियम', lines:['GREEN'], coordinates:{lat:28.6648,lng:77.0566}, isInterchange:false, zone:1 },
  { id:'NANGLOI', name:'Nangloi', nameHindi:'नांगलोई', lines:['GREEN'], coordinates:{lat:28.6657,lng:77.0446}, isInterchange:false, zone:1 },
  { id:'NANGLOI_RAILWAY_STATION', name:'Nangloi Railway Station', nameHindi:'नांगलोई रेलवे स्टेशन', lines:['GREEN'], coordinates:{lat:28.6660,lng:77.0339}, isInterchange:false, zone:1 },
  { id:'RAJDHANI_PARK', name:'Rajdhani Park', nameHindi:'राजधानी पार्क', lines:['GREEN'], coordinates:{lat:28.6682,lng:77.0223}, isInterchange:false, zone:1 },
  { id:'MUNDKA', name:'Mundka', nameHindi:'मुंडका', lines:['GREEN'], coordinates:{lat:28.6701,lng:77.0105}, isInterchange:false, zone:1 },
  { id:'MUNDKA_INDUSTRIAL_AREA', name:'Mundka Industrial Area', nameHindi:'मुंडका इंडस्ट्रियल एरिया', lines:['GREEN'], coordinates:{lat:28.6771,lng:76.9986}, isInterchange:false, zone:1 },
  { id:'GHEVRA', name:'Ghevra', nameHindi:'घेवड़ा', lines:['GREEN'], coordinates:{lat:28.6874,lng:76.9923}, isInterchange:false, zone:1 },
  { id:'TIKRI_KALAN', name:'Tikri Kalan', nameHindi:'टिकरी कलां', lines:['GREEN'], coordinates:{lat:28.6870,lng:76.9821}, isInterchange:false, zone:1 },
  { id:'TIKRI_BORDER', name:'Tikri Border', nameHindi:'टिकरी बॉर्डर', lines:['GREEN'], coordinates:{lat:28.6861,lng:76.9717}, isInterchange:false, zone:2 },
  { id:'PANDIT_SHREE_RAM_SHARMA', name:'Pandit Shree Ram Sharma', nameHindi:'पंडित श्री राम शर्मा', lines:['GREEN'], coordinates:{lat:28.6860,lng:76.9580}, isInterchange:false, zone:2 },
  { id:'BAHADURGARH_CITY', name:'Bahadurgarh City', nameHindi:'बहादुरगढ़ सिटी', lines:['GREEN'], coordinates:{lat:28.6859,lng:76.9415}, isInterchange:false, zone:2 },
  { id:'BRIGADIER_HOSHIYAR_SINGH', name:'Brigadier Hoshiyar Singh', nameHindi:'ब्रिगेडियर होशियार सिंह', lines:['GREEN'], coordinates:{lat:28.6861,lng:76.9275}, isInterchange:false, zone:2 },
];

// ── MAGENTA LINE new stations ──
const magentaStations = [
  { id:'DABRI_MOR', name:'Dabri Mor - Janakpuri South', nameHindi:'डाबरी मोड़ - जनकपुरी साउथ', lines:['MAGENTA'], coordinates:{lat:28.6189,lng:77.0800}, isInterchange:false, zone:1 },
  { id:'DASHRATHPURI', name:'Dashrathpuri', nameHindi:'दशरथपुरी', lines:['MAGENTA'], coordinates:{lat:28.6087,lng:77.0850}, isInterchange:false, zone:1 },
  { id:'PALAM', name:'Palam', nameHindi:'पालम', lines:['MAGENTA'], coordinates:{lat:28.5978,lng:77.0840}, isInterchange:false, zone:1 },
  { id:'SADAR_BAZAR_CANTONMENT', name:'Sadar Bazar Cantonment', nameHindi:'सदर बाजार कैंटोनमेंट', lines:['MAGENTA'], coordinates:{lat:28.5877,lng:77.0945}, isInterchange:false, zone:1 },
  { id:'TERMINAL_1_IGI', name:'Terminal 1-IGI Airport', nameHindi:'टर्मिनल 1-IGI एयरपोर्ट', lines:['MAGENTA'], coordinates:{lat:28.5767,lng:77.0975}, isInterchange:false, zone:1 },
  { id:'SHANKAR_VIHAR', name:'Shankar Vihar', nameHindi:'शंकर विहार', lines:['MAGENTA'], coordinates:{lat:28.5681,lng:77.1065}, isInterchange:false, zone:1 },
  { id:'VASANT_VIHAR', name:'Vasant Vihar', nameHindi:'वसंत विहार', lines:['MAGENTA'], coordinates:{lat:28.5607,lng:77.1191}, isInterchange:false, zone:1 },
  { id:'MUNIRKA', name:'Munirka', nameHindi:'मुनीरका', lines:['MAGENTA'], coordinates:{lat:28.5560,lng:77.1325}, isInterchange:false, zone:1 },
  { id:'RK_PURAM', name:'R.K. Puram', nameHindi:'आर.के. पुरम', lines:['MAGENTA'], coordinates:{lat:28.5543,lng:77.1494}, isInterchange:false, zone:1 },
  { id:'IIT_DELHI', name:'IIT Delhi', nameHindi:'आईआईटी दिल्ली', lines:['MAGENTA'], coordinates:{lat:28.5456,lng:77.1921}, isInterchange:false, zone:1 },
  { id:'PANCHSHEEL_PARK', name:'Panchsheel Park', nameHindi:'पंचशील पार्क', lines:['MAGENTA'], coordinates:{lat:28.5393,lng:77.2077}, isInterchange:false, zone:1 },
  { id:'CHIRAG_DELHI', name:'Chirag Delhi', nameHindi:'चिराग दिल्ली', lines:['MAGENTA'], coordinates:{lat:28.5327,lng:77.2185}, isInterchange:false, zone:1 },
  { id:'GREATER_KAILASH', name:'Greater Kailash', nameHindi:'ग्रेटर कैलाश', lines:['MAGENTA'], coordinates:{lat:28.5317,lng:77.2312}, isInterchange:false, zone:1 },
  { id:'NEHRU_ENCLAVE', name:'Nehru Enclave', nameHindi:'नेहरू एन्क्लेव', lines:['MAGENTA'], coordinates:{lat:28.5345,lng:77.2462}, isInterchange:false, zone:1 },
  { id:'OKHLA_NSIC', name:'Okhla NSIC', nameHindi:'ओखला एनएसआईसी', lines:['MAGENTA'], coordinates:{lat:28.5462,lng:77.2694}, isInterchange:false, zone:1 },
  { id:'SUKHDEV_VIHAR', name:'Sukhdev Vihar', nameHindi:'सुखदेव विहार', lines:['MAGENTA'], coordinates:{lat:28.5500,lng:77.2821}, isInterchange:false, zone:1 },
  { id:'JAMIA_MILLIA_ISLAMIA', name:'Jamia Millia Islamia', nameHindi:'जामिया मिलिया इस्लामिया', lines:['MAGENTA'], coordinates:{lat:28.5543,lng:77.2939}, isInterchange:false, zone:1 },
  { id:'OKHLA_VIHAR', name:'Okhla Vihar', nameHindi:'ओखला विहार', lines:['MAGENTA'], coordinates:{lat:28.5593,lng:77.3062}, isInterchange:false, zone:1 },
  { id:'JASOLA_VIHAR_SHAHEEN_BAGH', name:'Jasola Vihar Shaheen Bagh', nameHindi:'जसोला विहार शाहीन बाग', lines:['MAGENTA'], coordinates:{lat:28.5581,lng:77.3162}, isInterchange:false, zone:1 },
  { id:'KALINDI_KUNJ', name:'Kalindi Kunj', nameHindi:'कालिंदी कुंज', lines:['MAGENTA'], coordinates:{lat:28.5576,lng:77.3248}, isInterchange:false, zone:1 },
  { id:'OKHLA_BIRD_SANCTUARY', name:'Okhla Bird Sanctuary', nameHindi:'ओखला पक्षी विहार', lines:['MAGENTA'], coordinates:{lat:28.5617,lng:77.3308}, isInterchange:false, zone:1 },
];

// ── PINK LINE new stations ──
const pinkStations = [
  { id:'MAJLIS_PARK', name:'Majlis Park', nameHindi:'मजलिस पार्क', lines:['PINK'], coordinates:{lat:28.7245,lng:77.1598}, isInterchange:false, zone:1 },
  { id:'SHALIMAR_BAGH', name:'Shalimar Bagh', nameHindi:'शालीमार बाग', lines:['PINK'], coordinates:{lat:28.7130,lng:77.1665}, isInterchange:false, zone:1 },
  { id:'SHAKURPUR', name:'Shakurpur', nameHindi:'शकूरपुर', lines:['PINK'], coordinates:{lat:28.6858,lng:77.1493}, isInterchange:false, zone:1 },
  { id:'ESI_HOSPITAL', name:'ESI Hospital', nameHindi:'ईएसआई अस्पताल', lines:['PINK'], coordinates:{lat:28.6584,lng:77.1353}, isInterchange:false, zone:1 },
  { id:'MAYAPURI', name:'Mayapuri', nameHindi:'मायापुरी', lines:['PINK'], coordinates:{lat:28.6356,lng:77.1242}, isInterchange:false, zone:1 },
  { id:'NARAINA_VIHAR', name:'Naraina Vihar', nameHindi:'नारायणा विहार', lines:['PINK'], coordinates:{lat:28.6242,lng:77.1210}, isInterchange:false, zone:1 },
  { id:'DELHI_CANTT', name:'Delhi Cantt.', nameHindi:'दिल्ली कैंट.', lines:['PINK'], coordinates:{lat:28.6098,lng:77.1219}, isInterchange:false, zone:1 },
  { id:'DURGABAI_DESHMUKH', name:'Durgabai Deshmukh South Campus', nameHindi:'दुर्गाबाई देशमुख साउथ कैंपस', lines:['PINK'], coordinates:{lat:28.5986,lng:77.1360}, isInterchange:false, zone:1 },
  { id:'SIR_VISHWESHWARAIAH', name:'Sir Vishweshwaraiah Moti Bagh', nameHindi:'सर विश्वेश्वरैया मोती बाग', lines:['PINK'], coordinates:{lat:28.5920,lng:77.1503}, isInterchange:false, zone:1 },
  { id:'BHIKAJI_CAMA_PLACE', name:'Bhikaji Cama Place', nameHindi:'भीकाजी कामा प्लेस', lines:['PINK'], coordinates:{lat:28.5844,lng:77.1635}, isInterchange:false, zone:1 },
  { id:'SAROJINI_NAGAR', name:'Sarojini Nagar', nameHindi:'सरोजिनी नगर', lines:['PINK'], coordinates:{lat:28.5778,lng:77.1778}, isInterchange:false, zone:1 },
  { id:'SOUTH_EXTENSION', name:'South Extension', nameHindi:'साउथ एक्सटेंशन', lines:['PINK'], coordinates:{lat:28.5693,lng:77.2262}, isInterchange:false, zone:1 },
  { id:'VINOBAPURI', name:'Vinobapuri', nameHindi:'विनोबापुरी', lines:['PINK'], coordinates:{lat:28.5590,lng:77.2484}, isInterchange:false, zone:1 },
  { id:'ASHRAM', name:'Ashram', nameHindi:'आश्रम', lines:['PINK'], coordinates:{lat:28.5682,lng:77.2544}, isInterchange:false, zone:1 },
  { id:'SARAI_KALE_KHAN', name:'Sarai Kale Khan - Hazrat Nizamuddin', nameHindi:'सराय काले खाँ - हजरत निजामुद्दीन', lines:['PINK'], coordinates:{lat:28.5833,lng:77.2578}, isInterchange:false, zone:1 },
  { id:'MAYUR_VIHAR_POCKET_1', name:'Mayur Vihar Pocket-1', nameHindi:'मयूर विहार पॉकेट-1', lines:['PINK'], coordinates:{lat:28.6097,lng:77.2985}, isInterchange:false, zone:1 },
  { id:'TRILOKPURI_SANJAY_LAKE', name:'Trilokpuri - Sanjay Lake', nameHindi:'त्रिलोकपुरी - संजय लेक', lines:['PINK'], coordinates:{lat:28.6137,lng:77.3085}, isInterchange:false, zone:1 },
  { id:'EAST_VINOD_NAGAR', name:'East Vinod Nagar - Mayur Vihar-II', nameHindi:'ईस्ट विनोद नगर - मयूर विहार-II', lines:['PINK'], coordinates:{lat:28.6180,lng:77.3160}, isInterchange:false, zone:1 },
  { id:'MANDAWALI', name:'Mandawali - West Vinod Nagar', nameHindi:'मंडावली - वेस्ट विनोद नगर', lines:['PINK'], coordinates:{lat:28.6233,lng:77.3213}, isInterchange:false, zone:1 },
  { id:'IP_EXTENSION', name:'IP Extension', nameHindi:'आईपी एक्सटेंशन', lines:['PINK'], coordinates:{lat:28.6296,lng:77.3208}, isInterchange:false, zone:1 },
  { id:'KARKARDUMA_COURT', name:'Karkarduma Court', nameHindi:'कड़कड़डूमा कोर्ट', lines:['PINK'], coordinates:{lat:28.6350,lng:77.3000}, isInterchange:false, zone:1 },
  { id:'KRISHNA_NAGAR', name:'Krishna Nagar', nameHindi:'कृष्णा नगर', lines:['PINK'], coordinates:{lat:28.6527,lng:77.2900}, isInterchange:false, zone:1 },
  { id:'EAST_AZAD_NAGAR', name:'East Azad Nagar', nameHindi:'ईस्ट आजाद नगर', lines:['PINK'], coordinates:{lat:28.6620,lng:77.2817}, isInterchange:false, zone:1 },
  { id:'JAFFRABAD', name:'Jaffrabad', nameHindi:'जाफराबाद', lines:['PINK'], coordinates:{lat:28.6890,lng:77.2757}, isInterchange:false, zone:1 },
  { id:'MAUJPUR_BABARPUR', name:'Maujpur - Babarpur', nameHindi:'मौजपुर - बाबरपुर', lines:['PINK'], coordinates:{lat:28.6978,lng:77.2724}, isInterchange:false, zone:1 },
  { id:'GOKULPURI', name:'Gokulpuri', nameHindi:'गोकुलपुरी', lines:['PINK'], coordinates:{lat:28.7058,lng:77.2695}, isInterchange:false, zone:1 },
  { id:'JOHRI_ENCLAVE', name:'Johri Enclave', nameHindi:'जोहरी एन्क्लेव', lines:['PINK'], coordinates:{lat:28.7115,lng:77.2764}, isInterchange:false, zone:1 },
  { id:'SHIV_VIHAR', name:'Shiv Vihar', nameHindi:'शिव विहार', lines:['PINK'], coordinates:{lat:28.7151,lng:77.2827}, isInterchange:false, zone:1 },
];

for (const st of [...redStations, ...greenStations, ...magentaStations, ...pinkStations]) {
  addStation(st);
}

// ── RED LINE edges (28 edges) ──
const redEdges = [
  E('RITHALA','ROHINI_WEST','RED'), E('ROHINI_WEST','ROHINI_EAST','RED'),
  E('ROHINI_EAST','PITAMPURA','RED'), E('PITAMPURA','KOHAT_ENCLAVE','RED'),
  E('KOHAT_ENCLAVE','NETAJI_SUBHASH_PLACE','RED'), E('NETAJI_SUBHASH_PLACE','KESHAV_PURAM','RED'),
  E('KESHAV_PURAM','KANHAIYA_NAGAR','RED'), E('KANHAIYA_NAGAR','INDERLOK','RED'),
  E('INDERLOK','SHASTRI_NAGAR','RED'), E('SHASTRI_NAGAR','PRATAP_NAGAR','RED'),
  E('PRATAP_NAGAR','PUL_BANGASH','RED'), E('PUL_BANGASH','TIS_HAZARI','RED'),
  E('TIS_HAZARI','KASHMERE_GATE','RED'), E('KASHMERE_GATE','SHASTRI_PARK','RED'),
  E('SHASTRI_PARK','SEELAMPUR','RED'), E('SEELAMPUR','WELCOME','RED'),
  E('WELCOME','SHAHDARA','RED'), E('SHAHDARA','MANSAROVAR_PARK','RED'),
  E('MANSAROVAR_PARK','JHILMIL','RED'), E('JHILMIL','DILSHAD_GARDEN','RED'),
  E('DILSHAD_GARDEN','SHAHEED_NAGAR','RED'), E('SHAHEED_NAGAR','RAJ_BAGH','RED'),
  E('RAJ_BAGH','MAJOR_MOHIT_SHARMA','RED'), E('MAJOR_MOHIT_SHARMA','SHYAM_PARK','RED'),
  E('SHYAM_PARK','MOHAN_NAGAR','RED'), E('MOHAN_NAGAR','ARTHALA','RED'),
  E('ARTHALA','HINDON_RIVER','RED'), E('HINDON_RIVER','SHAHEED_STHAL','RED'),
];

// ── GREEN LINE edges (23 edges — branch Kirti Nagar to Ashok Park Main, then main line through Punjabi Bagh to Brigadier) ──
const greenEdges = [
  E('KIRTI_NAGAR','SATGURU_RAM_SINGH_MARG','GREEN'), E('SATGURU_RAM_SINGH_MARG','ASHOK_PARK_MAIN','GREEN'),
  E('INDERLOK','ASHOK_PARK_MAIN','GREEN'),
  E('ASHOK_PARK_MAIN','PUNJABI_BAGH','GREEN'),
  E('PUNJABI_BAGH','PUNJABI_BAGH_WEST','GREEN'),
  E('PUNJABI_BAGH_WEST','SHIVAJI_PARK','GREEN'), E('SHIVAJI_PARK','MADIPUR','GREEN'),
  E('MADIPUR','PASCHIM_VIHAR_EAST','GREEN'), E('PASCHIM_VIHAR_EAST','PASCHIM_VIHAR_WEST','GREEN'),
  E('PASCHIM_VIHAR_WEST','PEERAGARHI','GREEN'), E('PEERAGARHI','UDYOG_NAGAR','GREEN'),
  E('UDYOG_NAGAR','MAHARAJA_SURAJMAL_STADIUM','GREEN'), E('MAHARAJA_SURAJMAL_STADIUM','NANGLOI','GREEN'),
  E('NANGLOI','NANGLOI_RAILWAY_STATION','GREEN'), E('NANGLOI_RAILWAY_STATION','RAJDHANI_PARK','GREEN'),
  E('RAJDHANI_PARK','MUNDKA','GREEN'), E('MUNDKA','MUNDKA_INDUSTRIAL_AREA','GREEN'),
  E('MUNDKA_INDUSTRIAL_AREA','GHEVRA','GREEN'), E('GHEVRA','TIKRI_KALAN','GREEN'),
  E('TIKRI_KALAN','TIKRI_BORDER','GREEN'), E('TIKRI_BORDER','PANDIT_SHREE_RAM_SHARMA','GREEN'),
  E('PANDIT_SHREE_RAM_SHARMA','BAHADURGARH_CITY','GREEN'), E('BAHADURGARH_CITY','BRIGADIER_HOSHIYAR_SINGH','GREEN'),
];

// ── MAGENTA LINE edges (24 edges) ──
const magentaEdges = [
  E('JANAKPURI_WEST','DABRI_MOR','MAGENTA'), E('DABRI_MOR','DASHRATHPURI','MAGENTA'),
  E('DASHRATHPURI','PALAM','MAGENTA'), E('PALAM','SADAR_BAZAR_CANTONMENT','MAGENTA'),
  E('SADAR_BAZAR_CANTONMENT','TERMINAL_1_IGI','MAGENTA'), E('TERMINAL_1_IGI','SHANKAR_VIHAR','MAGENTA'),
  E('SHANKAR_VIHAR','VASANT_VIHAR','MAGENTA'), E('VASANT_VIHAR','MUNIRKA','MAGENTA'),
  E('MUNIRKA','RK_PURAM','MAGENTA'), E('RK_PURAM','HAUZ_KHAS','MAGENTA'),
  E('HAUZ_KHAS','IIT_DELHI','MAGENTA'), E('IIT_DELHI','PANCHSHEEL_PARK','MAGENTA'),
  E('PANCHSHEEL_PARK','CHIRAG_DELHI','MAGENTA'), E('CHIRAG_DELHI','GREATER_KAILASH','MAGENTA'),
  E('GREATER_KAILASH','NEHRU_ENCLAVE','MAGENTA'), E('NEHRU_ENCLAVE','KALKAJI_MANDIR','MAGENTA'),
  E('KALKAJI_MANDIR','OKHLA_NSIC','MAGENTA'), E('OKHLA_NSIC','SUKHDEV_VIHAR','MAGENTA'),
  E('SUKHDEV_VIHAR','JAMIA_MILLIA_ISLAMIA','MAGENTA'), E('JAMIA_MILLIA_ISLAMIA','OKHLA_VIHAR','MAGENTA'),
  E('OKHLA_VIHAR','JASOLA_VIHAR_SHAHEEN_BAGH','MAGENTA'), E('JASOLA_VIHAR_SHAHEEN_BAGH','KALINDI_KUNJ','MAGENTA'),
  E('KALINDI_KUNJ','OKHLA_BIRD_SANCTUARY','MAGENTA'), E('OKHLA_BIRD_SANCTUARY','BOTANICAL_GARDEN','MAGENTA'),
];

// ── PINK LINE edges (37 edges — single continuous ring connecting to Anand Vihar ISBT and Karkarduma without duplicate stations) ──
const pinkEdges = [
  E('MAJLIS_PARK','AZADPUR','PINK'), E('AZADPUR','SHALIMAR_BAGH','PINK'),
  E('SHALIMAR_BAGH','NETAJI_SUBHASH_PLACE','PINK'), E('NETAJI_SUBHASH_PLACE','SHAKURPUR','PINK'),
  E('SHAKURPUR','PUNJABI_BAGH_WEST','PINK'), E('PUNJABI_BAGH_WEST','ESI_HOSPITAL','PINK'),
  E('ESI_HOSPITAL','RAJOURI_GARDEN','PINK'), E('RAJOURI_GARDEN','MAYAPURI','PINK'),
  E('MAYAPURI','NARAINA_VIHAR','PINK'), E('NARAINA_VIHAR','DELHI_CANTT','PINK'),
  E('DELHI_CANTT','DURGABAI_DESHMUKH','PINK'), E('DURGABAI_DESHMUKH','SIR_VISHWESHWARAIAH','PINK'),
  E('SIR_VISHWESHWARAIAH','BHIKAJI_CAMA_PLACE','PINK'), E('BHIKAJI_CAMA_PLACE','SAROJINI_NAGAR','PINK'),
  E('SAROJINI_NAGAR','INA','PINK'), E('INA','SOUTH_EXTENSION','PINK'),
  E('SOUTH_EXTENSION','LAJPAT_NAGAR','PINK'), E('LAJPAT_NAGAR','VINOBAPURI','PINK'),
  E('VINOBAPURI','ASHRAM','PINK'), E('ASHRAM','SARAI_KALE_KHAN','PINK'),
  E('SARAI_KALE_KHAN','MAYUR_VIHAR_1','PINK'), E('MAYUR_VIHAR_1','MAYUR_VIHAR_POCKET_1','PINK'),
  E('MAYUR_VIHAR_POCKET_1','TRILOKPURI_SANJAY_LAKE','PINK'), E('TRILOKPURI_SANJAY_LAKE','EAST_VINOD_NAGAR','PINK'),
  E('EAST_VINOD_NAGAR','MANDAWALI','PINK'), E('MANDAWALI','IP_EXTENSION','PINK'),
  E('IP_EXTENSION','ANAND_VIHAR','PINK'), E('ANAND_VIHAR','KARKARDUMA','PINK'),
  E('KARKARDUMA','KARKARDUMA_COURT','PINK'), E('KARKARDUMA_COURT','KRISHNA_NAGAR','PINK'),
  E('KRISHNA_NAGAR','EAST_AZAD_NAGAR','PINK'), E('EAST_AZAD_NAGAR','WELCOME','PINK'),
  E('WELCOME','JAFFRABAD','PINK'), E('JAFFRABAD','MAUJPUR_BABARPUR','PINK'),
  E('MAUJPUR_BABARPUR','GOKULPURI','PINK'), E('GOKULPURI','JOHRI_ENCLAVE','PINK'),
  E('JOHRI_ENCLAVE','SHIV_VIHAR','PINK'),
];

for (const e of [...redEdges, ...greenEdges, ...magentaEdges, ...pinkEdges]) {
  addEdge(e);
}

// ── Integrity check ──
const stationIds = new Set(stations.map(s => s.id));
for (const e of edges) {
  if (!stationIds.has(e.from)) throw new Error('Edge refs unknown station: ' + e.from);
  if (!stationIds.has(e.to))   throw new Error('Edge refs unknown station: ' + e.to);
}

// ── Line membership verification ──
const stationMap = new Map(stations.map(s => [s.id, s]));
for (const e of edges) {
  const fromS = stationMap.get(e.from);
  const toS = stationMap.get(e.to);
  if (!fromS.lines.includes(e.line)) {
    throw new Error(`Station ${e.from} missing line ${e.line}`);
  }
  if (!toS.lines.includes(e.line)) {
    throw new Error(`Station ${e.to} missing line ${e.line}`);
  }
}

// Verify every line in station.lines has at least one connection
const lineSetByStation = new Map();
for (const e of edges) {
  if (!lineSetByStation.has(e.from)) lineSetByStation.set(e.from, new Set());
  if (!lineSetByStation.has(e.to)) lineSetByStation.set(e.to, new Set());
  lineSetByStation.get(e.from).add(e.line);
  lineSetByStation.get(e.to).add(e.line);
}
for (const s of stations) {
  const activeLines = lineSetByStation.get(s.id) || new Set();
  for (const l of s.lines) {
    if (!activeLines.has(l)) {
      throw new Error(`Station ${s.id} declares line ${l} but has no connections on that line!`);
    }
  }
}

// ── Counts ──
const lineCounts = {};
for (const s of stations) {
  for (const l of s.lines) lineCounts[l] = (lineCounts[l]||0)+1;
}
console.log('\nStation counts by line:');
for (const [l,c] of Object.entries(lineCounts).sort()) console.log('  '+l+': '+c);
console.log('\nTOTAL UNIQUE STATIONS: '+stations.length);
console.log('TOTAL EDGES: '+edges.length);

// ── Write ──
stationsData._meta.stationCount = stations.length;
stationsData._meta.description = 'Delhi Metro station data — Verified 7 Lines: Yellow, Blue, Violet, Red, Green, Magenta, Pink';
stationsData._meta.lastVerified = '2026-10';
stationsData.stations = stations;

connectionsData._meta.description = 'Delhi Metro edge data — Verified 7 Lines: Yellow, Blue, Violet, Red, Green, Magenta, Pink';
connectionsData._meta.lastVerified = '2026-10';
connectionsData.edges = edges;

writeFileSync(resolve(dataDir, 'stations.json'), JSON.stringify(stationsData, null, 2), 'utf8');
writeFileSync(resolve(dataDir, 'connections.json'), JSON.stringify(connectionsData, null, 2), 'utf8');
console.log('\nDone! stations.json and connections.json written successfully.');
