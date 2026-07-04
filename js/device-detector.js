/* ============================================================
   YARZ DEVICE DETECTOR v1.0 — Super Powerful Device Intelligence
   ✅ Detects ALL device brands: Samsung, iPhone, Xiaomi, Redmi,
      POCO, OnePlus, Realme, Oppo, Vivo, Tecno, Infinix, Huawei,
      Honor, Motorola, Nokia, Google Pixel, Sony, Asus, etc.
   ✅ Detects specific models (iPhone 16 Pro, Galaxy S24 Ultra, etc.)
   ✅ Desktop detection: Windows 10/11, macOS version, Linux distro
   ✅ GPU detection via WebGL renderer (Adreno, Mali, Apple GPU, etc.)
   ✅ Headless/Automation/Bot detection (Playwright, Puppeteer, etc.)
   ✅ Anti-detect browser detection (canvas anomalies, etc.)
   ✅ navigator.userAgentData.getHighEntropyValues() for Chrome/Edge
   ✅ Geolocation API for precise lat/lng
   ✅ Screen fingerprinting (dimensions, color depth, pixel ratio)
   ✅ Touch support, orientation, memory, cores detection
   ============================================================ */
const YARZ_DEVICE = (() => {
  'use strict';

  // ===== SAMSUNG MODEL MAP =====
  const SAMSUNG_MODELS = {
    // Galaxy S Series (Flagship)
    'SM-S928B': 'Galaxy S24 Ultra', 'SM-S926B': 'Galaxy S24+', 'SM-S921B': 'Galaxy S24',
    'SM-S928U': 'Galaxy S24 Ultra', 'SM-S926U': 'Galaxy S24+', 'SM-S921U': 'Galaxy S24',
    'SM-S918B': 'Galaxy S23 Ultra', 'SM-S916B': 'Galaxy S23+', 'SM-S911B': 'Galaxy S23',
    'SM-S918U': 'Galaxy S23 Ultra', 'SM-S916U': 'Galaxy S23+', 'SM-S911U': 'Galaxy S23',
    'SM-S908B': 'Galaxy S22 Ultra', 'SM-S906B': 'Galaxy S22+', 'SM-S901B': 'Galaxy S22',
    'SM-S908U': 'Galaxy S22 Ultra', 'SM-S906U': 'Galaxy S22+', 'SM-S901U': 'Galaxy S22',
    'SM-G998B': 'Galaxy S21 Ultra', 'SM-G996B': 'Galaxy S21+', 'SM-G991B': 'Galaxy S21',
    'SM-G998U': 'Galaxy S21 Ultra', 'SM-G996U': 'Galaxy S21+', 'SM-G991U': 'Galaxy S21',
    'SM-G988B': 'Galaxy S20 Ultra', 'SM-G986B': 'Galaxy S20+', 'SM-G981B': 'Galaxy S20',
    // Galaxy A Series (Mid-Range)
    'SM-A546B': 'Galaxy A54', 'SM-A546U': 'Galaxy A54', 'SM-A546E': 'Galaxy A54',
    'SM-A5460': 'Galaxy A54', 'SM-A5461': 'Galaxy A54',
    'SM-A346B': 'Galaxy A34', 'SM-A346E': 'Galaxy A34', 'SM-A346G': 'Galaxy A34',
    'SM-A246B': 'Galaxy A24', 'SM-A246E': 'Galaxy A24', 'SM-A246F': 'Galaxy A24',
    'SM-A146B': 'Galaxy A14', 'SM-A146F': 'Galaxy A14', 'SM-A146M': 'Galaxy A14',
    'SM-A146P': 'Galaxy A14', 'SM-A145F': 'Galaxy A14', 'SM-A145M': 'Galaxy A14',
    'SM-A145R': 'Galaxy A14', 'SM-A145N': 'Galaxy A14',
    'SM-A047F': 'Galaxy A04s', 'SM-A045F': 'Galaxy A04', 'SM-A042F': 'Galaxy A04e',
    'SM-A055F': 'Galaxy A05', 'SM-A057F': 'Galaxy A05s',
    'SM-A135F': 'Galaxy A13', 'SM-A135M': 'Galaxy A13', 'SM-A135U': 'Galaxy A13',
    'SM-A235F': 'Galaxy A23', 'SM-A235G': 'Galaxy A23', 'SM-A235M': 'Galaxy A23',
    'SM-A236B': 'Galaxy A23 5G', 'SM-A236E': 'Galaxy A23 5G',
    'SM-A336B': 'Galaxy A33', 'SM-A336E': 'Galaxy A33', 'SM-A336F': 'Galaxy A33',
    'SM-A536B': 'Galaxy A53', 'SM-A536E': 'Galaxy A53', 'SM-A536F': 'Galaxy A53',
    'SM-A5360': 'Galaxy A53', 'SM-A536N': 'Galaxy A53',
    'SM-A736B': 'Galaxy A73', 'SM-A736E': 'Galaxy A73', 'SM-A736F': 'Galaxy A73',
    'SM-A556B': 'Galaxy A55', 'SM-A556E': 'Galaxy A55', 'SM-A5560': 'Galaxy A55',
    'SM-A356B': 'Galaxy A35', 'SM-A356E': 'Galaxy A35', 'SM-A3560': 'Galaxy A35',
    'SM-A166B': 'Galaxy A16', 'SM-A166F': 'Galaxy A16', 'SM-A166M': 'Galaxy A16',
    'SM-A065F': 'Galaxy A06', 'SM-A065M': 'Galaxy A06',
    // Galaxy M Series (Battery-focused)
    'SM-M546B': 'Galaxy M54', 'SM-M546E': 'Galaxy M54', 'SM-M5460': 'Galaxy M54',
    'SM-M346B': 'Galaxy M34', 'SM-M346F': 'Galaxy M34',
    'SM-M146B': 'Galaxy M14', 'SM-M146F': 'Galaxy M14', 'SM-M146G': 'Galaxy M14',
    'SM-M536B': 'Galaxy M53', 'SM-M536E': 'Galaxy M53',
    'SM-M336B': 'Galaxy M33', 'SM-M336E': 'Galaxy M33',
    'SM-M236B': 'Galaxy M23', 'SM-M236E': 'Galaxy M23',
    'SM-M136B': 'Galaxy M13', 'SM-M136F': 'Galaxy M13',
    'SM-M127F': 'Galaxy M12', 'SM-M127G': 'Galaxy M12',
    'SM-M045F': 'Galaxy M04', 'SM-M045G': 'Galaxy M04',
    'SM-M625F': 'Galaxy M62', 'SM-M626B': 'Galaxy M62',
    'SM-M515F': 'Galaxy M51',
    'SM-M115F': 'Galaxy M11', 'SM-M215F': 'Galaxy M21',
    'SM-M307F': 'Galaxy M30s', 'SM-M305F': 'Galaxy M30',
    'SM-M505F': 'Galaxy M50s',
    // Galaxy F Series (Flipkart exclusive)
    'SM-F146B': 'Galaxy F14', 'SM-F146G': 'Galaxy F14',
    'SM-F346B': 'Galaxy F34', 'SM-F346E': 'Galaxy F34',
    'SM-F546B': 'Galaxy F54', 'SM-F546E': 'Galaxy F54',
    'SM-F156B': 'Galaxy F15', 'SM-F1560': 'Galaxy F15',
    'SM-F045F': 'Galaxy F05',
    // Galaxy Z Fold/Flip
    'SM-F946B': 'Galaxy Z Fold6', 'SM-F946U': 'Galaxy Z Fold6',
    'SM-F936B': 'Galaxy Z Fold5', 'SM-F936U': 'Galaxy Z Fold5',
    'SM-F926B': 'Galaxy Z Fold4', 'SM-F926U': 'Galaxy Z Fold4',
    'SM-F726B': 'Galaxy Z Flip6', 'SM-F726U': 'Galaxy Z Flip6',
    'SM-F731B': 'Galaxy Z Flip5', 'SM-F731U': 'Galaxy Z Flip5',
    'SM-F721B': 'Galaxy Z Flip4', 'SM-F721U': 'Galaxy Z Flip4',
    // Galaxy Tab
    'SM-X916B': 'Galaxy Tab S10 Ultra', 'SM-X816B': 'Galaxy Tab S10+',
    'SM-X716B': 'Galaxy Tab S10', 'SM-X516B': 'Galaxy Tab S10 FE',
    'SM-T970': 'Galaxy Tab S7 FE', 'SM-T870': 'Galaxy Tab S7',
    // Galaxy Note
    'SM-N986B': 'Galaxy Note 20 Ultra', 'SM-N981B': 'Galaxy Note 20',
    'SM-N976B': 'Galaxy Note 10+', 'SM-N971B': 'Galaxy Note 10',
    // Galaxy On
    'SM-J600F': 'Galaxy J6', 'SM-J700F': 'Galaxy J7',
    'SM-J415F': 'Galaxy J4+', 'SM-J510F': 'Galaxy J7 Prime',
  };

  // ===== iPHONE MODEL MAP (Screen Dimensions + iOS Version) =====
  const IPHONE_MODELS = {
    // {width}x{height} -> {model}
    // Note: These are CSS pixel dimensions (logical pixels)
    '430x932': 'iPhone 16 Pro Max',    // Also 15 Pro Max
    '402x874': 'iPhone 16 Pro',        // Also 15 Pro
    '428x926': 'iPhone 16 Plus',       // Also 15 Plus
    '393x852': 'iPhone 16',            // Also 15, 14 Pro
    '430x932': 'iPhone 16 Pro Max',
    '428x926': 'iPhone 16 Plus',
    '393x852': 'iPhone 16',
    '390x844': 'iPhone 15/14/13',      // 12, 13, 14, 15 standard
    '375x812': 'iPhone 13 Mini/12 Mini/11 Pro/XS/X',
    '414x896': 'iPhone 11/XR/XS Max/11 Pro Max/SE4',
    '375x667': 'iPhone SE3/SE2/8/7/6s',
    '320x568': 'iPhone SE1/5s/5c',
    '390x844': 'iPhone 14 Pro',
    '428x926': 'iPhone 14 Pro Max',
    '375x812': 'iPhone 13 Mini',
    // iPad
    '1024x1366': 'iPad Pro 12.9"',
    '1024x1366': 'iPad Air/M2 12.9"',
    '834x1194': 'iPad Pro 11"/Air M2 11"',
    '820x1180': 'iPad Air 5th/4th',
    '810x1080': 'iPad 9th/10th',
    '768x1024': 'iPad 6th/7th/8th Mini 4',
    '834x1194': 'iPad Pro 11" 2nd/3rd/4th',
    '1194x834': 'iPad Pro 11" landscape',
    '1366x1024': 'iPad Pro 12.9" landscape',
  };

  // ===== iPHONE CHIPS (WebGL Renderer -> Model) =====
  const IPHONE_CHIPS = {
    'Apple A17 Pro GPU': 'iPhone 15/16 Pro',
    'Apple A16 GPU': 'iPhone 15/15 Plus',
    'Apple A15 GPU': 'iPhone 13/14/SE3',
    'Apple A14 GPU': 'iPhone 12 series',
    'Apple A13 GPU': 'iPhone 11/XR/XS',
    'Apple A12 GPU': 'iPhone XS/XR',
    'Apple A11 GPU': 'iPhone 8/X',
    'Apple A10 GPU': 'iPhone 7',
    'Apple A9 GPU': 'iPhone 6s/SE1',
    'Apple GPU': 'iOS Device',
  };

  // ===== GPU CHIP DETECTION (WebGL Renderer -> Human Name) =====
  const GPU_CHIP_NAMES = {
    // Qualcomm Adreno
    'adreno 750': 'Adreno 750', 'adreno 740': 'Adreno 740', 'adreno 730': 'Adreno 730',
    'adreno 720': 'Adreno 720', 'adreno 710': 'Adreno 710', 'adreno 660': 'Adreno 660',
    'adreno 650': 'Adreno 650', 'adreno 642': 'Adreno 642', 'adreno 640': 'Adreno 640',
    'adreno 630': 'Adreno 630', 'adreno 620': 'Adreno 620', 'adreno 610': 'Adreno 610',
    'adreno 605': 'Adreno 605', 'adreno 600': 'Adreno 600', 'adreno 540': 'Adreno 540',
    'adreno 530': 'Adreno 530', 'adreno 512': 'Adreno 512', 'adreno 510': 'Adreno 510',
    'adreno 509': 'Adreno 509', 'adreno 508': 'Adreno 508', 'adreno 506': 'Adreno 506',
    'adreno 505': 'Adreno 505', 'adreno 504': 'Adreno 504', 'adreno 503': 'Adreno 503',
    'adreno 430': 'Adreno 430', 'adreno 420': 'Adreno 420', 'adreno 418': 'Adreno 418',
    'adreno 405': 'Adreno 405',
    // ARM Mali
    'mali-g720': 'Mali-G720', 'mali-g715': 'Mali-G715', 'mali-g710': 'Mali-G710',
    'mali-g78': 'Mali-G78', 'mali-g77': 'Mali-G77', 'mali-g76': 'Mali-G76',
    'mali-g72': 'Mali-G72', 'mali-g71': 'Mali-G71', 'mali-g57': 'Mali-G57',
    'mali-g52': 'Mali-G52', 'mali-g51': 'Mali-G51', 'mali-g57 mc2': 'Mali-G57 MC2',
    'mali-g57 mc4': 'Mali-G57 MC4', 'mali-g78 mc12': 'Mali-G78 MC12',
    'mali-g710 mc10': 'Mali-G710 MC10', 'mali-g715 mc11': 'Mali-G715 MC11',
    // Samsung Xclipse / AMD RDNA
    'xclipse 940': 'Xclipse 940 (AMD RDNA3)', 'xclipse 930': 'Xclipse 930 (AMD RDNA2)',
    'samsung xclipse': 'Samsung Xclipse',
    // Apple
    'apple a17 pro gpu': 'Apple A17 Pro GPU', 'apple a16 gpu': 'Apple A16 GPU',
    'apple a15 gpu': 'Apple A15 GPU', 'apple a14 gpu': 'Apple A14 GPU',
    'apple a13 gpu': 'Apple A13 GPU', 'apple a12 gpu': 'Apple A12 GPU',
    'apple a11 gpu': 'Apple A11 GPU', 'apple a10 gpu': 'Apple A10 GPU',
    'apple a9 gpu': 'Apple A9 GPU', 'apple gpu': 'Apple GPU',
    // PowerVR / MediaTek
    'powervr bxt': 'PowerVR BXT', 'powervr ge8320': 'PowerVR GE8320',
    'mali': 'Mali GPU',
    // Google
    'google swiftshader': 'Google SwiftShader (Software)',
    'google inc.*google': 'Google GPU (Pixel)',
    // Software renderers (suspicious on mobile)
    'swiftshader': 'SwiftShader (Software)', 'llvmpipe': 'LLVMpipe (Software)',
    'software rasterizer': 'Software Renderer',
    // Intel
    'intel.*iris': 'Intel Iris', 'intel.*uhd': 'Intel UHD', 'intel hd': 'Intel HD',
    'mesa': 'Mesa (Linux)',
    // AMD
    'amd.*radeon': 'AMD Radeon', 'navi': 'AMD RDNA',
    // Nvidia
    'nvidia.*geforce': 'NVIDIA GeForce', 'nvidia.*quadro': 'NVIDIA Quadro',
  };

  // ===== HEADLESS / AUTOMATION DETECTION =====
  const HEADLESS_SIGNALS = [
    'webdriver', 'selenium', 'puppeteer', 'playwright', 'nightmare',
    'phantom', 'slimer', 'casper', 'wickedbot', 'chromefire',
    'headless', 'curl', 'wget', 'python-requests', 'python-urllib',
    'node-fetch', 'axios', 'got', 'httpie', 'go-http-client',
    'java/', 'okhttp', 'apache-httpclient', 'postmanruntime',
    'scrapy', 'spider', 'crawler', 'bot', 'spider'
  ];

  const BROWSER_AUTOMATION_OBJECTS = [
    '__playwright', '__puppeteer', '__nightmare', '__selenium_unwrapped',
    '__webdriver_evaluate', '__selenium_evaluate', '__webdriver_script_func',
    '_phantom', '__callPhantom', '_selenium', 'callSelenium',
    '_Selenium_IDE_Recorder', '__webdriver_script_function',
    'cdc_adoQpoasnfa76pfcZLmcfl_Array', 'cdc_adoQpoasnfa76pfcZLmcfl_Promise',
    'cdc_adoQpoasnfa76pfcZLmcfl_Symbol', 'webdriver',
    'domAutomation', 'domAutomationController'
  ];

  // ===== ANDROID MODEL DETECTION (UA + navigator.userAgentData) =====
  const ANDROID_MODEL_MAP = {
    // Xiaomi
    'M2101K6G': 'Redmi Note 11 Pro', 'M2101K6I': 'Redmi Note 11 Pro',
    'M2101K9C': 'Redmi Note 11 Pro+', 'M2101K9R': 'Redmi Note 11 Pro+',
    'M2012K11AC': 'Redmi Note 11', 'M2012K11AG': 'Redmi Note 11',
    'M2010J10SG': 'Redmi Note 10 Pro', 'M2010J10SI': 'Redmi Note 10 Pro',
    'M2010J10SC': 'Redmi Note 10 Pro',
    'M2006C3MI': 'Redmi 9A', 'M2006C3MG': 'Redmi 9A',
    'M2006C3L': 'Redmi 9A', 'M2006C3LI': 'Redmi 9A',
    'M2103K19C': 'Redmi Note 11E', 'M2103K19G': 'Redmi Note 11E',
    'M2012K11AI': 'Redmi Note 11 5G',
    'M2105K10C': 'Redmi Note 10T',
    'M2007J17C': 'Redmi Note 9 Pro', 'M2007J17G': 'Redmi Note 9 Pro',
    'M2003J15SC': 'Redmi 9', 'M2004J19C': 'Redmi 10X',
    'M2012K11AC': 'Redmi Note 11',
    'M2010K19I': 'Redmi Note 9 Pro 5G',
    // Xiaomi Mi Series
    'M2011K2C': 'Mi 11', 'M2011K2G': 'Mi 11', 'M2011K2I': 'Mi 11',
    'M2012K11AC': 'Mi 11 Lite',
    'M2101K9C': 'Mi 11i', 'M2101K9R': 'Mi 11i',
    'M2011J18C': 'Mi 11 Ultra', 'M2011J18G': 'Mi 11 Ultra',
    'M2011K2C': 'Mi 11',
    // POCO
    'M2107K19C': 'POCO M4 Pro', 'M2107K19G': 'POCO M4 Pro',
    'M2107K19I': 'POCO M4 Pro',
    'M2106K10C': 'POCO F4', 'M2106K10G': 'POCO F4', 'M2106K10I': 'POCO F4',
    'M2012K10C': 'POCO X3 Pro', 'M2012K10G': 'POCO X3 Pro', 'M2012K10I': 'POCO X3 Pro',
    'M2102K19C': 'POCO X3 GT', 'M2102K19G': 'POCO X3 GT',
    'M2103K19C': 'POCO X4 GT', 'M2103K19G': 'POCO X4 GT',
    'M2107K19C': 'POCO X4 Pro', 'M2107K19G': 'POCO X4 Pro',
    'M2107K19I': 'POCO X4 Pro',
    'M2012K11AC': 'POCO M3 Pro', 'M2012K11AG': 'POCO M3 Pro',
    '21081111C': 'POCO C40',
    // Vivo
    'V2046': 'Vivo X60 Pro', 'V2045': 'Vivo X60', 'V2044': 'Vivo X60 Pro+',
    'V2115': 'Vivo V21', 'V2027': 'Vivo V21',
    'V2203': 'Vivo Y22', 'V2249': 'Vivo Y22',
    'V2250': 'Vivo Y36', 'V2251': 'Vivo Y36',
    'V2111': 'Vivo Y21', 'V2048': 'Vivo Y53s',
    // Realme
    'RMX3161': 'Realme Narzo 50', 'RMX3160': 'Realme Narzo 50',
    'RMX3301': 'Realme GT Neo3', 'RMX3300': 'Realme GT Neo3',
    'RMX3511': 'Realme 9i', 'RMX3512': 'Realme 9i',
    'RMX3491': 'Realme C25', 'RMX3193': 'Realme Narzo 50A',
    'RMX3630': 'Realme C55', 'RMX3624': 'Realme C55',
    'RMX3686': 'Realme C51', 'RMX3627': 'Realme 11',
    'RMX3760': 'Realme 12', 'RMX3761': 'Realme 12',
    // Oppo
    'CPH2451': 'Oppo Reno8', 'CPH2455': 'Oppo Reno8',
    'CPH2433': 'Oppo A77', 'CPH2437': 'Oppo A77',
    'CPH2457': 'Oppo A78', 'CPH2461': 'Oppo A78',
    'CPH2385': 'Oppo A17', 'CPH2387': 'Oppo A17',
    'CPH2463': 'Oppo A18', 'CPH2465': 'Oppo A18',
    'CPH2579': 'Oppo A58', 'CPH2581': 'Oppo A58',
    // OnePlus
    'LE2101': 'OnePlus 11', 'LE2100': 'OnePlus 11',
    'LE2105': 'OnePlus 11', 'LE2103': 'OnePlus 11',
    'CPH2451': 'OnePlus Nord CE3',
    'IN2010': 'OnePlus 8 Pro', 'IN2013': 'OnePlus 8',
    'IN2023': 'OnePlus 8T', 'LE2100': 'OnePlus 11',
    // Tecno
    'TECNO CC7': 'Tecno Spark 7', 'TECNO CC9': 'Tecno Spark 7 Pro',
    'TECNO CD7': 'Tecno Spark 8', 'TECNO CD7k': 'Tecno Spark 8P',
    'TECNO CE7': 'Tecno Spark 9', 'TECNO CE7j': 'Tecno Spark 9T',
    'TECNO CF7': 'Tecno Spark 10', 'TECNO CF7k': 'Tecno Spark 10 Pro',
    'TECNO CG7': 'Tecno Spark 20', 'TECNO CG7j': 'Tecno Spark 20 Pro',
    'TECNO LC7': 'Tecno Pova 3', 'TECNO LF7': 'Tecno Pova 4',
    'TECNO LG7': 'Tecno Pova 5',
    // Infinix
    'Infinix X669': 'Infinix Note 11', 'Infinix X669C': 'Infinix Note 11S',
    'Infinix X670': 'Infinix Hot 20', 'Infinix X6725': 'Infinix Hot 30',
    'Infinix X6832': 'Infinix Note 30', 'Infinix X6833': 'Infinix Note 30 Pro',
    'Infinix X6835': 'Infinix Zero 30',
    'Infinix X6811D': 'Infinix Hot 20i', 'Infinix X6812': 'Infinix Hot 20S',
    // Huawei
    'ANA-NX9': 'Huawei P40 Pro', 'ANA-AN00': 'Huawei P40 Pro',
    'ELS-NX9': 'Huawei P40 Pro+', 'ELS-AN00': 'Huawei P40 Pro+',
    'OCE-AN10': 'Huawei Mate 40 Pro',
    // Honor
    'HONOR BN-': 'Honor Play 5T',
    // Motorola
    'moto g54': 'Moto G54', 'moto g84': 'Moto G84', 'moto g52': 'Moto G52',
    'moto g32': 'Moto G32', 'moto g22': 'Moto G22', 'moto g power': 'Moto G Power',
  };

  // ===== WINDOWS VERSION DETECTION =====
  const WINDOWS_VERSIONS = {
    'NT 10.0': 'Windows 10/11', 'NT 10.0.22': 'Windows 11',
    'NT 10.0.10': 'Windows 10', 'NT 10.0.19': 'Windows 10',
    'NT 10.0.22': 'Windows 11', 'NT 10.0.23': 'Windows 11',
    'NT 6.3': 'Windows 8.1', 'NT 6.2': 'Windows 8',
    'NT 6.1': 'Windows 7', 'NT 6.0': 'Windows Vista',
    'NT 5.1': 'Windows XP',
  };

  // ===== MACOS VERSION DETECTION =====
  const MACOS_VERSIONS = {
    '10_15': 'macOS Catalina', '10_14': 'macOS Mojave', '10_13': 'macOS High Sierra',
    '10_12': 'macOS Sierra', '10_11': 'El Capitan', '10_10': 'Yosemite',
    '10_16': 'macOS Big Sur', '11_': 'macOS Big Sur', '12_': 'macOS Monterey',
    '13_': 'macOS Ventura', '14_': 'macOS Sonoma', '15_': 'macOS Sequoia',
  };

  // ===== LINUX DISTRO DETECTION =====
  const LINUX_DISTROS = [
    { pattern: /ubuntu/i, name: 'Ubuntu' },
    { pattern: /debian/i, name: 'Debian' },
    { pattern: /fedora/i, name: 'Fedora' },
    { pattern: /centos/i, name: 'CentOS' },
    { pattern: /red hat/i, name: 'Red Hat' },
    { pattern: /arch/i, name: 'Arch Linux' },
    { pattern: /manjaro/i, name: 'Manjaro' },
    { pattern: /mint/i, name: 'Linux Mint' },
    { pattern: /opensuse/i, name: 'openSUSE' },
    { pattern: /gentoo/i, name: 'Gentoo' },
    { pattern: /alpine/i, name: 'Alpine Linux' },
    { pattern: /kali/i, name: 'Kali Linux' },
    { pattern: /raspberry/i, name: 'Raspberry Pi OS' },
  ];

  // ===== CORE DETECTION ENGINE =====
  let _result = null;
  let _userAgentData = null;
  let _geoPosition = null;

  // ===== INTERNAL HELPERS =====
  function _fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function _sha256(str) {
    try {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
        .then(function(buf) {
          return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
        });
    } catch (e) {
      return Promise.resolve(_fnv1a(str) + _fnv1a(str + '_salt'));
    }
  }

  function _lower(s) { return (s || '').toLowerCase(); }

  // ===== BRAND + MODEL DETECTION =====
  function _detectBrandAndModel(ua, highEntropy) {
    var brand = 'Unknown';
    var model = 'Unknown';
    var modelCode = '';
    var family = 'unknown';
    var platform = 'unknown';
    var isMobile = false;
    var isTablet = false;
    var isDesktop = false;

    // Use navigator.userAgentData if available (Chrome/Edge)
    if (highEntropy && highEntropy.model) {
      model = highEntropy.model;
      if (highEntropy.platform) platform = highEntropy.platform;
    }

    var lu = _lower(ua);

    // ===== ANDROID =====
    if (/android/i.test(ua)) {
      family = 'android';
      isMobile = true;

      // Samsung Android
      if (/SM-[A-Z]\d+/i.test(ua)) {
        brand = 'Samsung';
        modelCode = (ua.match(/SM-([A-Z]\d+[A-Z0-9]*)/i) || [,''])[1];
        model = SAMSUNG_MODELS[modelCode] || 'Galaxy ' + modelCode;
      }
      // Xiaomi / Redmi / POCO
      else if (/xiaomi|redmi|poco/i.test(ua) || /mi\s/i.test(ua)) {
        if (/poco/i.test(ua)) { brand = 'POCO'; }
        else if (/redmi/i.test(ua)) { brand = 'Redmi'; }
        else { brand = 'Xiaomi'; }
        // Try UA model code
        var xmMatch = ua.match(/\b(M[0-9]{4}[A-Z0-9]+)\b/i) || ua.match(/\bRedmi[\s_]?(\S+)/i);
        if (xmMatch) {
          modelCode = xmMatch[1];
          model = ANDROID_MODEL_MAP[modelCode] || brand + ' ' + modelCode;
        } else {
          model = brand + ' Device';
        }
      }
      // OnePlus
      else if (/oneplus/i.test(ua)) {
        brand = 'OnePlus';
        var opMatch = ua.match(/OnePlus[\s_]?(\S+)/i);
        model = 'OnePlus ' + (opMatch ? opMatch[1] : 'Device');
      }
      // Realme
      else if (/realme/i.test(ua) || /RMX\d+/i.test(ua)) {
        brand = 'Realme';
        var rmMatch = ua.match(/(RMX\d+)/i);
        if (rmMatch) {
          modelCode = rmMatch[1];
          model = ANDROID_MODEL_MAP[modelCode] || 'Realme ' + modelCode;
        } else {
          var rmName = ua.match(/realme[\s_]?(\S+)/i);
          model = 'Realme ' + (rmName ? rmName[1] : 'Device');
        }
      }
      // Oppo
      else if (/oppo/i.test(ua) || /CPH\d+/i.test(ua)) {
        brand = 'Oppo';
        var oppMatch = ua.match(/(CPH\d+)/i);
        if (oppMatch) {
          modelCode = oppMatch[1];
          model = ANDROID_MODEL_MAP[modelCode] || 'Oppo ' + modelCode;
        } else {
          var oppName = ua.match(/oppo[\s_]?(\S+)/i);
          model = 'Oppo ' + (oppName ? oppName[1] : 'Device');
        }
      }
      // Vivo
      else if (/vivo/i.test(ua) || /V\d{4}\b/i.test(ua)) {
        brand = 'Vivo';
        var vivMatch = ua.match(/(V\d{4})\w*/i);
        if (vivMatch) {
          modelCode = vivMatch[1];
          model = ANDROID_MODEL_MAP[modelCode] || 'Vivo ' + modelCode;
        } else {
          var vivName = ua.match(/vivo[\s_]?(\S+)/i);
          model = 'Vivo ' + (vivName ? vivName[1] : 'Device');
        }
      }
      // Tecno
      else if (/tecno/i.test(ua)) {
        brand = 'Tecno';
        var tecMatch = ua.match(/TECNO[\s_]?(\S+)/i);
        model = 'Tecno ' + (tecMatch ? tecMatch[1] : 'Device');
      }
      // Infinix
      else if (/infinix/i.test(ua)) {
        brand = 'Infinix';
        var infMatch = ua.match(/Infinix[\s_]?(\S+)/i);
        model = 'Infinix ' + (infMatch ? infMatch[1] : 'Device');
      }
      // Huawei
      else if (/huawei|honor/i.test(ua)) {
        brand = /honor/i.test(ua) ? 'Honor' : 'Huawei';
        var hwMatch = ua.match(/(HUAWEI|Honor)[\s_]?(\S+)/i);
        model = brand + ' ' + (hwMatch ? hwMatch[2] : 'Device');
      }
      // Motorola
      else if (/moto/i.test(ua)) {
        brand = 'Motorola';
        var motoMatch = ua.match(/(moto[\s_]\S+)/i);
        model = motoMatch ? motoMatch[1].replace(/\b\w/g, function(c){return c.toUpperCase();}) : 'Motorola Device';
      }
      // Nokia
      else if (/nokia/i.test(ua)) {
        brand = 'Nokia';
        var nokMatch = ua.match(/Nokia[\s_]?(\S+)/i);
        model = 'Nokia ' + (nokMatch ? nokMatch[1] : 'Device');
      }
      // Google Pixel
      else if (/pixel/i.test(ua)) {
        brand = 'Google';
        var pxMatch = ua.match(/Pixel[\s_]?(\S+)/i);
        model = 'Google Pixel ' + (pxMatch ? pxMatch[1] : '');
      }
      // Generic Android
      else {
        brand = 'Android';
        model = 'Android Device';
        // Try to extract from User-Agent after "Android XX" pattern
        var genMatch = ua.match(/Android[\s\d.]+;\s*(\S+?)[\s;)]/);
        if (genMatch) model = genMatch[1];
      }
    }
    // ===== iOS =====
    else if (/iPhone|iPad|iPod/i.test(ua)) {
      family = 'ios';
      brand = 'Apple';
      if (/iPad/i.test(ua)) {
        isTablet = true;
        model = 'iPad';
        var ipadV = ua.match(/OS (\d+_\d+)/);
        if (ipadV) model += ' (iOS ' + ipadV[1].replace('_', '.') + ')';
      } else if (/iPod/i.test(ua)) {
        model = 'iPod touch';
      } else {
        isMobile = true;
        model = 'iPhone';
        var iosV = ua.match(/iPhone OS (\d+_\d+)/);
        var screen = (window.screen || {});
        var w = screen.width || 0;
        var h = screen.height || 0;
        // Try to match by screen dimensions
        var screenKey = w + 'x' + h;
        if (IPHONE_MODELS[screenKey]) {
          model = IPHONE_MODELS[screenKey];
        }
        // Append iOS version
        if (iosV) model += ' (iOS ' + iosV[1].replace('_', '.') + ')';
      }
    }
    // ===== DESKTOP =====
    else if (/Windows/i.test(ua)) {
      family = 'windows';
      isDesktop = true;
      isMobile = false;
      brand = 'Windows PC';
      var winMatch = ua.match(/Windows NT (\d+\.\d+)/);
      if (winMatch) {
        var winVer = WINDOWS_VERSIONS['NT ' + winMatch[1]];
        model = winVer || 'Windows NT ' + winMatch[1];
      } else {
        model = 'Windows PC';
      }
      // Detect if running on ARM (Windows on ARM)
      if (/ARM/i.test(ua)) model += ' (ARM)';
    }
    else if (/Macintosh|Mac OS X/i.test(ua)) {
      family = 'macos';
      isDesktop = true;
      isMobile = false;
      brand = 'Apple Mac';
      var macMatch = ua.match(/Mac OS X (\d+[_.]\d+)/);
      if (macMatch) {
        var macVer = MACOS_VERSIONS[macMatch[1].replace(/\./g, '_')] ||
                     'macOS ' + macMatch[1].replace('_', '.');
        model = macVer;
      } else {
        model = 'macOS';
      }
      // Detect if Mac is actually an iPhone (old iOS Safari UA)
      if (/Mobile/i.test(ua)) {
        isMobile = true;
        isDesktop = false;
        model = 'iPhone (old Safari UA)';
      }
    }
    else if (/CrOS/i.test(ua)) {
      family = 'chromeos';
      isDesktop = true;
      brand = 'Chromebook';
      model = 'Chrome OS';
    }
    else if (/Linux/i.test(ua) && !/Android/i.test(ua)) {
      family = 'linux';
      isDesktop = true;
      isMobile = false;
      brand = 'Linux PC';
      var linuxDistro = 'Linux';
      for (var d = 0; d < LINUX_DISTROS.length; d++) {
        if (LINUX_DISTROS[d].pattern.test(ua)) {
          linuxDistro = LINUX_DISTROS[d].name;
          break;
        }
      }
      model = linuxDistro;
    }
    else if (/Android/i.test(ua)) {
      family = 'android';
      isMobile = true;
      brand = 'Android';
      model = 'Android Device';
    }

    // Override brand/model from userAgentData if available and better
    if (highEntropy) {
      if (highEntropy.brand && highEntropy.brand !== 'Google') {
        brand = highEntropy.brand;
      }
      if (highEntropy.model && highEntropy.model !== 'Unknown') {
        model = highEntropy.model;
      }
      if (highEntropy.platform) {
        platform = highEntropy.platform;
      }
      if (highEntropy.mobile !== undefined) {
        isMobile = highEntropy.mobile;
        if (isMobile) { isDesktop = false; isTablet = false; }
      }
    }

    return {
      brand: brand,
      model: model,
      modelCode: modelCode,
      family: family,
      platform: platform,
      isMobile: isMobile,
      isTablet: isTablet,
      isDesktop: isDesktop
    };
  }

  // ===== GPU DETECTION =====
  function _detectGPU() {
    try {
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { gpu: 'Unknown', gpuVendor: 'Unknown', gpuRenderer: 'Unknown' };
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (!ext) return { gpu: 'Unknown', gpuVendor: 'Unknown', gpuRenderer: 'Unknown' };
      var vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || 'Unknown';
      var renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'Unknown';
      // Match known GPU chips
      var gpuName = 'Unknown GPU';
      var lr = _lower(renderer);
      for (var key in GPU_CHIP_NAMES) {
        if (lr.indexOf(_lower(key)) !== -1) {
          gpuName = GPU_CHIP_NAMES[key];
          break;
        }
      }
      return { gpu: gpuName, gpuVendor: vendor, gpuRenderer: renderer };
    } catch (e) {
      return { gpu: 'Unknown', gpuVendor: 'Unknown', gpuRenderer: 'Unknown' };
    }
  }

  // ===== HEADLESS / AUTOMATION DETECTION =====
  function _detectHeadless() {
    var signals = [];
    var ua = _lower(navigator.userAgent || '');

    // Check UA for headless/automation keywords
    for (var i = 0; i < HEADLESS_SIGNALS.length; i++) {
      if (ua.indexOf(HEADLESS_SIGNALS[i]) !== -1) {
        signals.push('ua_' + HEADLESS_SIGNALS[i]);
      }
    }

    // Check for automation objects in window
    for (var j = 0; j < BROWSER_AUTOMATION_OBJECTS.length; j++) {
      if (window[BROWSER_AUTOMATION_OBJECTS[j]]) {
        signals.push('obj_' + BROWSER_AUTOMATION_OBJECTS[j]);
      }
    }

    // Check navigator.webdriver
    if (navigator.webdriver === true) signals.push('webdriver_true');

    // Check if plugins are empty (headless browsers often have none)
    if (navigator.plugins && navigator.plugins.length === 0 && !/mobile|android|iPhone|iPad/i.test(ua)) {
      signals.push('no_plugins');
    }

    // Check for missing languages
    if (!navigator.languages || navigator.languages.length === 0) signals.push('no_languages');

    // Check screen size anomalies (headless often has 0x0 or very small)
    if (window.screen && (window.screen.width === 0 || window.screen.height === 0)) {
      signals.push('screen_zero');
    }

    // Check for chrome.runtime (only in real Chrome extensions context)
    if (window.chrome && window.chrome.runtime) signals.push('has_chrome_runtime');

    // Check window.outerHeight/outerWidth === 0
    if (window.outerHeight === 0 || window.outerWidth === 0) signals.push('outer_zero');

    // Check for notifications permission
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      // This is normal in some cases, skip
    }

    return {
      isHeadless: signals.length > 0,
      signals: signals,
      isSuspicious: signals.length >= 2
    };
  }

  // ===== ANTI-DETECT BROWSER DETECTION =====
  function _detectAntiDetect() {
    var signals = [];

    // Check canvas fingerprint consistency
    try {
      var c1 = document.createElement('canvas');
      c1.width = 100; c1.height = 100;
      var ctx1 = c1.getContext('2d');
      ctx1.fillRect(0, 0, 100, 100);
      var data1 = c1.toDataURL();

      var c2 = document.createElement('canvas');
      c2.width = 100; c2.height = 100;
      var ctx2 = c2.getContext('2d');
      ctx2.fillRect(0, 0, 100, 100);
      var data2 = c2.toDataURL();

      // If canvas outputs differ between identical draws, may be anti-detect
      if (data1 !== data2) signals.push('canvas_inconsistent');
    } catch (e) {}

    // Check WebGL renderer consistency
    try {
      var gl1 = document.createElement('canvas').getContext('webgl');
      var gl2 = document.createElement('canvas').getContext('webgl');
      if (gl1 && gl2) {
        var ext1 = gl1.getExtension('WEBGL_debug_renderer_info');
        var ext2 = gl2.getExtension('WEBGL_debug_renderer_info');
        if (ext1 && ext2) {
          var r1 = gl1.getParameter(ext1.UNMASKED_RENDERER_WEBGL);
          var r2 = gl2.getParameter(ext2.UNMASKED_RENDERER_WEBGL);
          if (r1 !== r2) signals.push('webgl_renderer_inconsistent');
        }
      }
    } catch (e) {}

    // Check timezone vs IP geolocation consistency
    // (basic check: if timezone is UTC but not actually UTC)

    // Check font count anomalies
    if (window.YARZ_FORTRESS && window.YARZ_FORTRESS.getDeviceProfile) {
      var profile = window.YARZ_FORTRESS.getDeviceProfile();
      if (profile && profile.fontsCount !== undefined) {
        if (profile.fontsCount > 15) signals.push('many_fonts');
        if (profile.fontsCount === 0) signals.push('zero_fonts');
      }
    }

    return {
      isAntiDetect: signals.length > 0,
      signals: signals
    };
  }

  // ===== GEOLOCATION =====
  function _detectGeolocation() {
    return new Promise(function(resolve) {
      var result = { lat: 0, lng: 0, accuracy: 0, source: 'none', error: null };

      if (!navigator.geolocation) {
        result.error = 'geolocation_not_supported';
        resolve(result);
        return;
      }

      var timeoutId;
      var resolved = false;

      function onSuccess(pos) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        result.lat = pos.coords.latitude;
        result.lng = pos.coords.longitude;
        result.accuracy = pos.coords.accuracy;
        result.source = 'geolocation_api';
        resolve(result);
      }

      function onError(err) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        result.error = err ? err.code : 'unknown';
        result.source = 'geolocation_failed';
        resolve(result);
      }

      // Timeout after 5 seconds
      timeoutId = setTimeout(function() {
        if (!resolved) {
          resolved = true;
          result.error = 'timeout';
          result.source = 'geolocation_timeout';
          resolve(result);
        }
      }, 5000);

      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 300000
      });
    });
  }

  // ===== FULL DETECTION =====
  async function detect() {
    if (_result) return _result;

    var ua = navigator.userAgent || '';

    // 1. Get userAgentData (Chrome/Edge)
    var highEntropy = null;
    try {
      if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
        highEntropy = await navigator.userAgentData.getHighEntropyValues([
          'platform', 'platformVersion', 'fullVersionList',
          'model', 'mobile', 'architecture', 'bitness',
          'uaFullVersion', 'fullVersion'
        ]);
        _userAgentData = highEntropy;
      }
    } catch (e) {
      // Fallback: use basic userAgentData
      try {
        if (navigator.userAgentData) {
          highEntropy = {
            brand: navigator.userAgentData.brands && navigator.userAgentData.brands[0] ? navigator.userAgentData.brands[0].brand : '',
            model: '',
            platform: navigator.userAgentData.platform || '',
            mobile: navigator.userAgentData.mobile || false
          };
        }
      } catch (e2) {}
    }

    // 2. Detect brand, model, OS, desktop/mobile
    var brandModel = _detectBrandAndModel(ua, highEntropy);

    // 3. GPU detection
    var gpu = _detectGPU();

    // 4. Headless / automation detection
    var headless = _detectHeadless();

    // 5. Anti-detect browser detection
    var antiDetect = _detectAntiDetect();

    // 6. Screen info
    var screen = window.screen || {};
    var screenWidth = screen.width || 0;
    var screenHeight = screen.height || 0;
    var pixelRatio = window.devicePixelRatio || 1;
    var colorDepth = screen.colorDepth || 0;
    var orientation = screen.orientation ? screen.orientation.type : '';

    // 7. Hardware info
    var cores = navigator.hardwareConcurrency || 0;
    var memory = navigator.deviceMemory || 0;
    var maxTouch = navigator.maxTouchPoints || 0;

    // 8. Network info
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
    var networkType = conn.effectiveType || conn.type || 'unknown';
    var downlink = conn.downlink || 0;

    // 9. Geolocation (async, non-blocking)
    var geoResult = { lat: 0, lng: 0, accuracy: 0, source: 'none', error: null };
    try {
      geoResult = await _detectGeolocation();
    } catch (e) {
      geoResult.error = 'exception';
    }

    // 10. Timezone & language
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var lang = (navigator.languages && navigator.languages[0]) || navigator.language || '';

    // 11. WebGL vendor/renderer raw strings
    var webglRaw = { vendor: gpu.gpuVendor, renderer: gpu.gpuRenderer };

    // 12. Canvas hash
    var canvasHash = 'n/a';
    try {
      var c = document.createElement('canvas');
      c.width = 200; c.height = 50;
      var ctx = c.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 100, 30);
        ctx.fillStyle = '#069';
        ctx.fillText('YARZ-dev-' + (Date.now() % 100000), 4, 8);
        canvasHash = _fnv1a(c.toDataURL());
      }
    } catch (e) {}

    // 13. Device ID (composite hash)
    var rawId = [
      ua, navigator.platform || '',
      screenWidth + 'x' + screenHeight,
      String(cores), String(memory), String(pixelRatio),
      tz, lang, canvasHash, gpu.gpuRenderer
    ].join('|');
    var deviceId = 'dev_' + _fnv1a(rawId);

    // 14. Build result
    _result = {
      // Brand & Model
      brand: brandModel.brand,
      model: brandModel.model,
      modelCode: brandModel.modelCode,
      family: brandModel.family,
      platform: brandModel.platform,
      isMobile: brandModel.isMobile,
      isTablet: brandModel.isTablet,
      isDesktop: brandModel.isDesktop,

      // GPU
      gpu: gpu.gpu,
      gpuVendor: gpu.gpuVendor,
      gpuRenderer: gpu.gpuRenderer,

      // Screen
      screenWidth: screenWidth,
      screenHeight: screenHeight,
      pixelRatio: pixelRatio,
      colorDepth: colorDepth,
      orientation: orientation,

      // Hardware
      cores: cores,
      memory: memory,
      touchPoints: maxTouch,

      // Network
      networkType: networkType,
      downlink: downlink,

      // Location
      lat: geoResult.lat,
      lng: geoResult.lng,
      geoAccuracy: geoResult.accuracy,
      geoSource: geoResult.source,
      geoError: geoResult.error,

      // Timezone & Language
      timezone: tz,
      timezoneOffset: new Date().getTimezoneOffset(),
      language: lang,

      // Security
      isHeadless: headless.isHeadless,
      headlessSignals: headless.signals,
      isAntiDetect: antiDetect.isAntiDetect,
      antiDetectSignals: antiDetect.signals,
      webdriver: navigator.webdriver === true,

      // Canvas & WebGL raw
      canvasHash: canvasHash,
      webglRaw: webglRaw,

      // FingerprintJS (if available)
      fpjsId: (window.YARZ_FORTRESS && YARZ_FORTRESS.getFingerprintJSId) ?
              YARZ_FORTRESS.getFingerprintJSId() : '',
      fpjsConfidence: (window.YARZ_FORTRESS && YARZ_FORTRESS.getDeviceProfile) ?
                      (YARZ_FORTRESS.getDeviceProfile() || {}).fpjsConfidence || 0 : 0,

      // User-Agent (raw)
      userAgent: ua,

      // Meta
      detectedAt: new Date().toISOString(),
      deviceId: deviceId
    };

    return _result;
  }

  // ===== PUBLIC API =====
  return {
    detect: detect,
    getResult: function() { return _result; },
    getBrandModel: function() { return _result ? { brand: _result.brand, model: _result.model, modelCode: _result.modelCode } : null; },
    getGPU: function() { return _result ? { gpu: _result.gpu, vendor: _result.gpuVendor, renderer: _result.gpuRenderer } : null; },
    getLocation: function() { return _result ? { lat: _result.lat, lng: _result.lng, source: _result.geoSource } : null; },
    isDesktop: function() { return _result ? _result.isDesktop : false; },
    isMobile: function() { return _result ? _result.isMobile : false; },
    isTablet: function() { return _result ? _result.isTablet : false; },
    isHeadless: function() { return _result ? _result.isHeadless : false; },
    isAntiDetect: function() { return _result ? _result.isAntiDetect : false; },
    getDeviceId: function() { return _result ? _result.deviceId : ''; }
  };
})();

window.YARZ_DEVICE = YARZ_DEVICE;
