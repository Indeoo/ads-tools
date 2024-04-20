import puppeteer from 'puppeteer-core';
import fetch from 'node-fetch';
import axios from 'axios';
import path from 'path';
import { spawn } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import GhostCursor from './ghost-cursor/lib/spoof.js';
import fs from 'fs/promises';
import { writeFileSync } from 'fs';
import { getRandomInt, randomBetween, getWindowPosition, getProfilesFromFile, shuffleArray, delay, getRandomElementFromSet, detectMetaMaskVersion, XP_TABLE} from './utils.js';
//config

import { RUN_QUESTS, DELAY_BETWEEN_QUESTS, DELAY_START, DELAY_BROWSER, DELAY_BROWSER_CLOSE, LOGIN_METAMASK_FIRST, SHUFFLE_PROFILES, DEBUG_QUESTS_BUTTONS, LOG_SAFE_CLICKS, ADD_CURSOR, METAMASK_PW, METAMASK_PW_2, BROWSER, ADS_PORT, CAPTCHA_MONSTER, CAPTCHA_MONSTER_API_KEY, FREEZE_QUEST_RESTART_INTERVAL, API_KEY} from './config.js'

const { createCursor, installMouseHelper } = GhostCursor;
export const argv = yargs(hideBin(process.argv))
  .options({ // https://github.com/yargs/yargs/blob/main/docs/api.md#optionskey-opt
    'q': {
      alias: 'quest',
      describe: 'quest name to run (repeat multiple times as --q quest1 --q quest2). will run all quests if not specified',
      default: [],
      type: 'array'
    },
    'p': {
      alias: 'profile',
      describe: 'profile id. will use all profiles (shuffled) if not specified',
      default: 0
    },
    't': {
      alias: 'threads',
      describe: 'parallel browsers count',
      default: 10,
      type: 'number'
    },
    'l': {
      alias: 'limit',
      describe: 'limit profiles count for execution',
      default: 5000,
      type: 'number'
    },
    'show-cursor': {
      describe: 'show cursor on pages (use only for debugging)',
      default: false,
      type: 'boolean'
    },
    'test': {
      describe: 'test mode',
      default: false,
      type: 'boolean'
    }
  })
  .parse();

// if(argv.profile) {
//   process.exit(0);
// }

//чтобы просмотреть эти настройки, как их указывать при запуске скрипта - прописать в консоли "node lineapark --help"
const IS_TEST = argv.test;
const PROFILE = argv.p;                //если вписан -p ИД профиля, то будет только тестовый профиль включен.
const PARALLEL_PROFILES = argv.t;      //количество потоков/браузеров работающих одновременно, указывать -t
const LIMIT_PROFILES = argv.l;         //сколько всего профилей делаем, если указал -l 10, а в файле профилей 100, возьмет только 10 рандомно.
let SELECTED_QUESTS = argv.q;          //Если пусто, то делает все квесты, если задавать то делает только то, что задано, задать можно через терминал с пробелами или здесь через запятую

if(IS_TEST) console.log(argv);
if(LOGIN_METAMASK_FIRST && METAMASK_PW === '') process.exit(console.log('No metamask password in the config.js!'));
if(API_KEY === '') process.exit(console.log('NO API KEY!'));
//y - Count of reserved launches browsers
let x = 0;
let y = 0;
let running = 0;
const priorityQuests = ['ParkEntrance', 'VoyageGaming', 'SecurityLearn', 'MetamaskPrioritizes'];
const sideQuests = ['CUBEs'];
const questsData = {
  ParkEntrance: { href: "/quests/linea-park-entrance", quizBTNs: ["7a1d1cc8-d144-4b4d-a3ed-1381da033553"] },
  VoyageGaming: { href: "/quests/the-linea-voyage-gaming-and-social-linea-park", quizBTNs: ["2378d927-79a5-4b54-8ab8-857aa64fb821", "127ddd13-709f-45cf-836d-af17db29801f"] },
  SecurityLearn: { href: "/quests/security-learn", quizBTNs: ["a2"] },
  MetamaskPrioritizes: { href: "/quests/metamask-prioritizes-user-security", quizBTNs: ["928ef9b8-3289-4300-9208-92558f3342f8", "0d0bb30c-82b1-4124-a67c-407fbd9df13b"] },
  GamerBoom: { href: "/quests/linea-gamerboom", quizBTNs: ["a2"], bonus: true },
  SpaceFalcon: { href: "/quests/linea-space-falcon", quizBTNs: [] },
  Nidum: { href: "/quests/linea-sidus", quizBTNs: [] },
  Snap: { href: "/quests/linea-pictograph", quizBTNs: [], bonus: true },
  Abyss: { href: "/quests/linea-abyss-world", quizBTNs: [] },
  Satoshi: { href: "/quests/linea-satoshi-universe", quizBTNs: ["2d4e97b9-38cd-4c27-9670-dc9305ccd328", "a1", "b90c697f-d717-4385-b694-3fb09fc9671a"] },
  Yooldo: { href: "/quests/linea-yooldo", quizBTNs: [] },
  AsMatch: { href: "/quests/linea-asmatch", quizBTNs: [] },
  BitAvatar: { href: "/quests/linea-bitavatar", quizBTNs: [] },
  ReadOn: { href: "/quests/linea-readon", quizBTNs: [] },
  Sarubol: { href: "/quests/linea-metasky", quizBTNs: [] },
  //Yuliverse: { href: "/quests/linea-yuliverse", quizBTNs: [] },
  LuckyCat: { href: "/quests/linea-timeless-wallet", quizBTNs: [] },
  Omnizone: { href: "/quests/linea-brototype", quizBTNs: []},
  Battlemon: { href: "/quests/linea-battlemon", quizBTNs: []},
  PlayNouns: { href: "/quests/linea-play-nouns", quizBTNs: []},
  Galactic: { href: "/quests/linea-townstory", quizBTNs: [], bonus: true},
  Gamic: { href: "/quests/linea-gamic-app", quizBTNs: []},
  Send: { href: "/quests/linea-sending-me", quizBTNs: []},
  Dmail: { href: "/quests/linea-dmail", quizBTNs: []},
  SocialScan: { href: "/quests/linea-socialscan", quizBTNs: []},
  LineaPark: { href: "/quests/layer3-at-linea-park", quizBTNs: [], bonus: true},
  CUBEs: { href: "/quests/cubes-on-linea", quizBTNs: []},
  Macaw: { href: "/quests/linea-macaw", quizBTNs: []},
  Survive: { href: "/quests/linea-openfort", quizBTNs: []},
  Zace: { href: "/quests/linea-zace", quizBTNs: []},
  Dexsport: { href: "/quests/linea-dexsport", quizBTNs: []},
  FrogWar: { href: "/quests/frog-war-404", quizBTNs: [], bonus: true},
  ACG_WORLDS: { href: "/quests/linea-acg", quizBTNs: []},
  AlienSwap: { href: "/quests/linea-alienswap", quizBTNs: []},
  Bilinear: { href: "/quests/lineas-knobs-bilinear", quizBTNs: []},
  Micro3: { href: "/quests/linea-micro3", quizBTNs: []},
  ArenaGames: { href: "/quests/linea-arena-games", quizBTNs: []},
  Imagine: { href: "/quests/imaginairynfts-lineas-artisan-trail", quizBTNs: []},
  // PoHInstructions: { href: "/quests/poh-instructions", quizBTNs: []},
  // TrustaEgg: { href: "/quests/trusta-labs", quizBTNs: []},
  // Taskmaster: { href: "/quests/easter-surprise-1", quizBTNs: []},
  // Q2048: { href: "/quests/2048-zypher", quizBTNs: []}
}

let profiles = await getProfilesFromFile();
let countProfiles = profiles.length;

if(SHUFFLE_PROFILES) {
  profiles = shuffleArray(profiles);
}
if(LIMIT_PROFILES > 0) {
  profiles = profiles.slice(0, LIMIT_PROFILES);
}

const CURSOR_SYMBOL = Symbol('CURSOR');
async function addCursorToPage(page, isPageLoaded = false) {
  if(!page[CURSOR_SYMBOL]) {
    const cursor = page[CURSOR_SYMBOL] = createCursor(page, {
      x: getRandomInt(200, BROWSER.windowWidth - 200),
      y: getRandomInt(200, BROWSER.windowHeight - 200)
    }, true);
    cursor.forceToggleRandomMove(true);

    if(argv.showCursor) {
      await installMouseHelper(page, isPageLoaded ? false : true);
    }
  }
}

const questsToSend = [];
const sendQuests = () => {
  if(questsToSend.length == 0) {
    setTimeout(sendQuests, 5e3);
    return;
  }

  const quests = questsToSend.slice();
  questsToSend.length = 0;

  fetch('https://smarthand.pro/php-scripts/linea.php', {
    method: 'POST',
    body: JSON.stringify(quests),
    headers: {
      'Content-Type': 'application/json',
      'api-key': API_KEY
    }
  })
  .then(res => res.text())
  .then(text => {
    if(text !== 'sugar') {
      const err = new Error('bad response');
      throw err;
    } else {
      console.log(`Sent ${quests.length} quests | ${API_KEY}`);
    }
  })
  .catch(() => {
    questsToSend.push(...quests);
  })
  .finally(() => {
    setTimeout(sendQuests, 5e3);
    // console.warn('Player aliases:', playerAliases.size);
  });
};

sendQuests();

async function getAchievedQuests(profileId) {
  try {
    const res = await fetch(`https://smarthand.pro/php-scripts/linea.php?getAchievedQuests=${profileId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'api-key': API_KEY
      }
    });

    return await res.json();
  } catch(err) {
    return [];
  }
}

// const PROCESSED_SYMBOL = Symbol('PROCESSED');
// function processAnyNewPage(page) {
//   if(page[PROCESSED_SYMBOL]) {
//     return;
//   }

//   page[PROCESSED_SYMBOL] = true;
//   addCursorToPage(page);
// }

class Profile {
  constructor(profile) {
    this.profile = profile;
    this.browser = null;
    this.metamaskID = null;
    this.isLoggedMetaMask = false;
    this.wallet = null;
    this.lineaParkPage = null;
    this.loggedIn = 0;
    this.startQuestTime = Date.now();
  }

  setLineaPage(page, cursor) {
    this.lineaParkPage = page;
    if(ADD_CURSOR) addCursorToPage(page);
  }

  click(selector, log) {
    return this.clickDifferentPage(this.lineaParkPage, selector, log);
  }

  clickDifferentPage(page, selector, log) {
    return safeClick(page, selector, this.profile, log);
  }

  logError = (...args) => {
    if(IS_TEST) console.error(`!!!err!!!`, ...args);
    else process.stdout.write(args.join(' '));

    // writeFileSync(`log.txt`, `!!!err!!! ${args.join(' ')}` + '\n', {flag: 'a'});
  };

  log = (...args) => {
    const message = args.join(' '); // Преобразование всех аргументов в строку
    if(IS_TEST) {
      console.log(message);
    } else {
      process.stdout.write(message); // Добавляем перенос строки для читаемости
    }

    // writeFileSync(`log.txt`, args.join(' ').toString() + '\n', {flag: 'a'});
  };

  goToPark() {
    return this.lineaParkPage.goto('https://layer3.xyz/linea-park', {timeout: 60e3, waitUntil: 'load'});
  }
}

async function checkAchievedQuests(profileId) {
  const quests = await getAchievedQuests(profileId);
  let filteredQuests = [];

  let lowerCaseData = {};
  for(let quest of quests) {
    lowerCaseData[quest.name.toLowerCase()] = { exp: quest.exp, bonusExp: quest.bonusExp };
  }

  // console.log('232', quests)

  let welcomeQuestsCompleted = false;
  if(lowerCaseData['welcome'] !== undefined && lowerCaseData['welcome'] !== '' && lowerCaseData['welcome'] !== '-1') {
    welcomeQuestsCompleted = true;
    // filteredQuests = filteredQuests.concat(priorityQuests);
  }

  if(SELECTED_QUESTS.length == 0) {
    // Если нет выбранных квестов, то используем все доступные квесты
    SELECTED_QUESTS = Object.keys(questsData).map(quest => quest.toLowerCase());
  } else {
    SELECTED_QUESTS = SELECTED_QUESTS.map(quest => quest.toLowerCase());
  }

  const lowerCasePriorityQuests = priorityQuests.map(quest => quest.toLowerCase());

  let remainingQuests = SELECTED_QUESTS.filter(questName => {
    const quest = lowerCaseData[questName];
    if(!quest) {
      return true;
    }
    const questNameOriginal = Object.keys(questsData).find(key => key.toLowerCase() === questName);
    const isBonusQuest = questNameOriginal && questsData[questNameOriginal].bonus;

    // Если квест присутствует в welcomeQuests и welcomeQuestsCompleted === true, то исключаем его
    if(lowerCasePriorityQuests.includes(questName) && welcomeQuestsCompleted) {
      return false;
    }
    const needsToBeDone = quest.exp === undefined || quest.exp === '' || quest.exp === '-1';
    const bonusCompleted = quest.bonusExp !== undefined && quest.bonusExp !== '' && quest.bonusExp !== '-1';

    // if(questName === 'gamerboom') {
    //   console.log('needToBeDone', needsToBeDone, 'isBonusQuest', isBonusQuest, 'bonusCompleted', bonusCompleted)
    // }
    return needsToBeDone || (isBonusQuest && !bonusCompleted);
  });

  filteredQuests = filteredQuests.concat(remainingQuests);
  if(IS_TEST) console.log('After check quests request, remained to do quests ->', filteredQuests);

  return filteredQuests.length > 0;
}

let uniqueId = 0;

const puppeteerRunInWorker = async(profile, profileUniqueId) => {
  ++running;
  let resolve, reject;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });

  const restartAfterError = () => {
    --running;
    puppeteerRunInWorker(profile, profileUniqueId);
  };

  let spawnArgs;
  try {
    const childProcess = spawn('node', spawnArgs = [
      path.join(path.resolve(), 'lineapark.js'),
      `--p=${profile}`,
      `--show-cursor=${argv.showCursor}`,
      `--test=${argv.test}`,
      ...SELECTED_QUESTS.map((q) => `--q=${q}`)
    ]);

    childProcess.stdout.on('data', (data) => {
      const now = new Date();
      const simpleTimeString = now.toTimeString().split(' ')[0]; // Пример: 15:20:30
      console.log(`|${simpleTimeString}| [${profileUniqueId}/${countProfiles}][${profile}]`, data.toString());
      // writeFileSync(`log.txt`, `|${simpleTimeString}| [${profileUniqueId}/${countProfiles}][${profile}] `, {flag: 'a'});
    });

    // При поступлении данных в stderr выводим их в консоль
    childProcess.stderr.on('data', (data) => {
      console.error(`P${profile} error`, data.toString());
    });

    // Обработка события завершения процесса
    childProcess.on('close', (code) => {
      console.log(`P${profile}(${profileUniqueId}) - exit`, code);
      // writeFileSync(`log.txt`, `P${profile}(${profileUniqueId}) - exit ${code}\n`, {flag: 'a'});
      if(code) {
        restartAfterError();
      } else {
        resolve();
      }
    });

    await promise;
  } catch(err) {
    console.error('spawn error', err, spawnArgs);
  }
  --running;
  runProfilesSequentially(profiles);
};

const runProfilesSequentially = async(profiles) => {
  if(PROFILE) { // * slave section
    if(running) {
      return;
    }

    puppeteerRun(PROFILE, uniqueId);
    return;
  }

  // * master section
  if(!profiles.length || running >= PARALLEL_PROFILES) {
    return;
  }

  IS_TEST ? console.log("PROFILE FOR TEST:", PROFILE) : console.log("PROFILES FOR WORK:", profiles);
  const _profiles = profiles.splice(0, PARALLEL_PROFILES - running);
  let checkLeftProfiles = false;
  for(const profile of _profiles) {
    uniqueId++;
    const isGood = await checkAchievedQuests(profile);
    if(!isGood) {
      console.log(`${profile}(${uniqueId}) Achieved all quests????`)
      // countProfiles--;
      checkLeftProfiles = true;
      continue;
    }

    puppeteerRunInWorker(profile, uniqueId);
    await delay(randomBetween(DELAY_BROWSER[0], DELAY_BROWSER[1])); // задержка между запусками
  }

  if(checkLeftProfiles) {
    return runProfilesSequentially(profiles);
  }
};

runProfilesSequentially(profiles);
// const runInterval = setInterval(() => {
//   runProfilesSequentially(profiles);
//   if(profiles.length == 0) clearInterval(runInterval);
// }, 10e3);

/**
 * log (optional)
 * cursor (optional) - ghost-cursor
 */
async function safeClick(page, selector, profile, log, index) {
  // if((log && LOG_SAFE_CLICKS || IS_TEST && LOG_SAFE_CLICKS)) console.log('safeStart.1', selector)

  const elementExists = await page.evaluate((selector, index) => {
    const elements = document.querySelectorAll(selector);
    return index !== undefined ? elements.length > index : !!elements[0];
  }, selector, index);

  const isDisabled = await page.evaluate((selector, index) => {
    const elements = document.querySelectorAll(selector);
    const element = index !== undefined ? elements[index] : elements[0];
    return element ? element.hasAttribute('disabled') : false;
  }, selector, index);

  if(elementExists && !isDisabled) {
    if((log && LOG_SAFE_CLICKS || IS_TEST && LOG_SAFE_CLICKS)) console.log(`safeClick.2`, selector)

    const cursor = page[CURSOR_SYMBOL];
    if(IS_TEST > 0) console.log('using ghost-cursor for click:', !!cursor);
    if(IS_TEST > 0) console.log('using ghost-cursor click selector:', index !== undefined ? `${selector}:nth-child(${index + 1})` : selector);
    if(cursor) {
      const targetSelector = index !== undefined ? `${selector}:nth-child(${index + 1})` : selector;
      try {
        await cursor.click(targetSelector, {
          moveDelay: 500,
          moveSpeed: getRandomInt(400, 700),
          paddingPercentage: 42
        });
      } catch (e) {
        if(IS_TEST) console.log('!!!!!POPITALSYA NAJAT KOGDA KVIZ PROPAL!!!!!!', targetSelector)
      }
    } else {
      const targetSelector = index !== undefined ? `${selector}:nth-child(${index + 1})` : selector;
      await page.click(targetSelector);
    }
  } else {
    if(IS_TEST) console.log(`NO CLICK! NO Element:`, selector)
  }
}

const bringPageToFront = async(page, oldPage) => {
  if(page === oldPage) {
    return;
  }

  const oldCursor = oldPage ? oldPage[CURSOR_SYMBOL] : undefined;
  if(oldCursor) {
    oldCursor.forceToggleRandomMove(false);
  }

  await page.bringToFront();
  await page.waitForTimeout(2e3);

  const newCursor = page[CURSOR_SYMBOL];
  if(newCursor) {
    newCursor.forceToggleRandomMove(true);
  }
};

const waitForNewTab = async(browser, delay) => {
  const newTarget = await new Promise((resolve) => {
    const onTarget = (target) => {
      clearTimeout(timeout);
      resolve(target);
    };
    browser.once('targetcreated', onTarget);
    const timeout = setTimeout(() => {
      browser.off('targetcreated', onTarget);
      resolve();
    }, delay);
  });

  if(!newTarget) {
    return;
  }

  const newPage = await newTarget.page();
  return newPage;
};

const switchToNewTab = async (browser, currentTabs, addCursor, oldPage, delay) => {
  // let newTab;
  // // Ожидаем, когда количество вкладок увеличится на 1
  // await new Promise(resolve => {
  //   const checkTabs = setInterval(async () => {
  //     const tabs = await browser.pages();
  //     if (tabs.length > currentTabs.length) {
  //       clearInterval(checkTabs);
  //       newTab = tabs.find(tab => !currentTabs.includes(tab)); // Находим новую вкладку
  //       resolve();
  //     }
  //   }, 1000); // Проверяем каждую секунду
  // });
  const newPage = await waitForNewTab(browser, delay);
  if(newPage) {
    if(ADD_CURSOR & addCursor) {
      await addCursorToPage(newPage, true);
    }

    await bringPageToFront(newPage, oldPage);
    // processAnyNewPage(newTab);
    return newPage; // Возвращаем новую вкладку для дальнейшего взаимодействия
  } else {
    throw new Error('New tab was not opened');
  }
};

const waitAndClickDisabledButton = (page, selector, profile) => {
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      if(IS_TEST) console.log('Waiting for captcha...');
      const isDisabled = await page.evaluate((selector) => {
        const button = document.querySelector(selector);
        return button ? button.hasAttribute('disabled') : false;
      }, selector);

      if (!isDisabled) {
        await safeClick(page, selector, profile);
        clearInterval(interval);
        resolve(true);
      }
    }, 5000);
  });
};

async function findElementById(page, id) {
  const element = await page.evaluate((id) => {
    const element = document.getElementById(id);
    if (element) {
      return true;
    } else {
      return false;
    }
  }, id);

  return element;
}

async function setCapMonsterCloud(browser) {
  return new Promise(async (resolve) => {
    const page = await browser.newPage();
    await page.goto('chrome-extension://pabjfbciaedomjjfelfafejkppknjleh/popup.html');
    await page.waitForSelector('#client-key-input');

    const inputValue = await page.evaluate(() => {
      const inputElement = document.querySelector('input[id="client-key-input"]');
      return inputElement.value;
    });

    if(inputValue === '') {
      await page.type('input[id="client-key-input"]', CAPTCHA_MONSTER_API_KEY);
      await delay(300);
      await page.click('#client-key-save-btn');
    }

    await page.close();
    resolve(true)
  });
}

function setExp(profileId, wallet, questName, success = true, isBonusStage = false) {
  if(questName === 'CUBEs') return;
  if(questName !== 'ParkEntrance' && questName !== 'VoyageGaming' && questName !== 'SecurityLearn') {
    if(questName === 'MetamaskPrioritizes') questName = 'Welcome';
    // console.log(`[PROFILE - ${profileId}] update ++EXP in csv:`, questName);
    if(!success) {
      if(isBonusStage) {
        // console.log('SetExp.1')
        questsToSend.push({ "browser": profileId, "wallet": wallet, "quests": [ { "name": questName, "exp": XP_TABLE[questName].exp } ] });
      } else {
        // console.log('SetExp.2')
        questsToSend.push({ "browser": profileId, "wallet": wallet, "quests": [ { "name": questName, "exp": -1} ] });
      }
    } else {
      if(questsData[questName]?.bonus) {
        // console.log('SetExp.3')
        questsToSend.push({ "browser": profileId, "wallet": wallet, "quests": [ { "name": questName, "exp": XP_TABLE[questName].exp, "bonusExp": XP_TABLE[questName].bonusExp } ] });
      } else {
        // console.log('SetExp.4')
        questsToSend.push({ "browser": profileId, "wallet": wallet, "quests": [ { "name": questName, "exp": XP_TABLE[questName] } ] });
      }
    }
  }
}

const logTextFromElement = async (page, selector) => {
  const text = await page.evaluate(selector => {
    const element = document.querySelector(selector);
    if (element) {
      return element.innerText;
    } else {
      return 'Элемент не найден.';
    }
  }, selector);

  return text;
};

async function getButtonTextsFromContainers(page, questExecuted, multiple, noButtons) {
  let containerSelectors;
  let container = '';
  if(IS_TEST) console.log('questExec', questExecuted, 'multiple', multiple, 'noBtns', noButtons)

  if(questExecuted.status) {
    containerSelectors = [
      '.flex.h-full.w-full.max-w-quest-content .relative.flex.w-full.justify-between'
    ];

    if(questExecuted.name === 'LineaPark' && multiple) {
      containerSelectors.push('.flex.h-full.w-full.max-w-quest-content'); // Добавляем этот селектор, если multiple=true
      container = 'multiple';
    }

  } else {
    containerSelectors = ['.fixed.inset-x-none.bottom-none.z-1.flex'];
  }

  if(questExecuted.name === 'CUBEs' && noButtons) containerSelectors = ['.flex.h-full.w-full.max-w-quest-content'];
  if(IS_TEST) console.log('container', containerSelectors);

  return page.evaluate((selectors) => {
    function getUniqueSelector(element, levels = 2) {
      if (!element || !element.tagName) return '';
      if (element.id) return `#${element.id}`;

      let selector = element.tagName.toLowerCase();
      if (element.classList && element.classList.length) {
        selector += '.' + Array.from(element.classList).join('.');
      }

      let parent = element.parentNode;
      let count = 0;
      while (parent && count < levels) {
        if (parent.tagName && parent.tagName.toLowerCase() !== '__next') {
          const parentSelector = parent.tagName.toLowerCase() + (parent.id ? `#${parent.id}` : '') + (parent.className ? `.${parent.className.replace(/\s+/g, '.')}` : '');
          selector = parentSelector + ' > ' + selector;
          count++;
        }
        parent = parent.parentNode;
      }

      return selector;
    }

    let buttons = [];
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(container => {
        const buttonsInContainer = container.querySelectorAll('button, p');
        buttonsInContainer.forEach(node => {
          const buttonText = node.textContent.trim();
          const buttonSelector = getUniqueSelector(node);
          buttons.push({ text: buttonText, selector: buttonSelector });
        });
      });
    });

    return buttons;
  }, containerSelectors);
}

async function checkMetaMaskLogin(_profile) {
  const {browser, profile, metamaskID} = _profile;
  return new Promise(async (resolve) => {
    if(!LOGIN_METAMASK_FIRST) return resolve(true);
    let wallet = null;

    let pages = await browser.pages();
    let metaMaskPage = null;
    let tempPage = await browser.newPage();

    for (const page of pages) {
      const title = await page.title();
      const url = await page.url();

      if (title === "MetaMask" || url.includes('layer3.xyz')) {
        await page.close();
        await delay(2e3);
      }
    }

    await delay(1e3);
    if(!metaMaskPage) {
      _profile.log(`Open MetaMask page...`)
      metaMaskPage = await browser.newPage();
      await metaMaskPage.goto(`chrome-extension://${metamaskID}/home.html#unlock`, {waitUntil: 'load'});
    }

    // processAnyNewPage(metaMaskPage);

    await metaMaskPage.waitForTimeout(2e3);
    if(tempPage !== null) await tempPage.close();
    const hasHomeContainerClass = await metaMaskPage.evaluate(() => {
      return !!document.querySelector('.home__container');
    });
    _profile.log(`MetaMask .2`)

    if(!hasHomeContainerClass) {
      try {
        const chosenNetwork = await logTextFromElement(metaMaskPage, '.mm-box.mm-text.mm-text--body-sm');
        if(chosenNetwork.includes('Linea')) {
          //Switch network to ETH
          await _profile.clickDifferentPage(metaMaskPage, '[data-testid="network-display"]')
          await metaMaskPage.waitForSelector('.mm-box.characters');
          await _profile.clickDifferentPage(metaMaskPage, '.mm-box.multichain-network-list-menu > div > div:nth-child(1) > div');
        }

        await metaMaskPage.type('#password', METAMASK_PW);
        await metaMaskPage.waitForTimeout(1e3);
        await _profile.clickDifferentPage(metaMaskPage, '[data-testid="unlock-submit"]');
        await metaMaskPage.waitForTimeout(4e3);

        const unlockButton = await metaMaskPage.evaluate(() => {
          return !!document.querySelector('[data-testid="unlock-submit"]');
        });
        if(unlockButton) {
          await _profile.clickDifferentPage(metaMaskPage, '#password');
          // Очистить поле ввода
          for(let i = 0; i < METAMASK_PW.length + 10; i++) {
              await metaMaskPage.keyboard.press('Backspace'); // Нажать клавишу Backspace 20 раз
          }

          await metaMaskPage.type('#password', METAMASK_PW_2);
          await metaMaskPage.waitForTimeout(1e3);
          await _profile.clickDifferentPage(metaMaskPage, '[data-testid="unlock-submit"]');
          await metaMaskPage.waitForTimeout(4e3);
        }
      } catch(e) {
        console.log(e)
        _profile.log(`NO METAMASK!`);
        browser.close();
        return resolve(false);
      }
    }
    //Remove popup
    await metaMaskPage.waitForSelector('.mm-box.main-container-wrapper');
    await metaMaskPage.evaluate(() => {
      const elementToRemove = document.querySelector('.popover-wrap.whats-new-popup__popove');
      if (elementToRemove) {
        elementToRemove.remove();
      }
    });
    await delay(2e3);
    await metaMaskPage.evaluate(() => {
      const elementToRemove = document.querySelector('#popover-content');
      if (elementToRemove) {
        elementToRemove.remove();
      }
    });
    await delay(1e3);
    //Switch network back to LINEA
    await _profile.clickDifferentPage(metaMaskPage, '[data-testid="network-display"]');
    await metaMaskPage.waitForSelector('.mm-box.characters');
    await _profile.clickDifferentPage(metaMaskPage, '.mm-box.multichain-network-list-menu > div > div:nth-child(2) > div');
    //Get Wallet
    await metaMaskPage.waitForSelector('.mm-box.multichain-app-header__contents button.mm-button-icon--size-sm');
    await _profile.clickDifferentPage(metaMaskPage, '.mm-box.multichain-app-header__contents button.mm-button-icon--size-sm');
    await metaMaskPage.waitForSelector('[data-testid="account-list-menu-details"]');
    await _profile.clickDifferentPage(metaMaskPage, '[data-testid="account-list-menu-details"]');
    //& fix network freeze
    await metaMaskPage.waitForSelector('.mm-box.mm-text.mm-text--inherit.mm-box--color-primary-default .mm-box.mm-box--display-flex').catch(async (e) => {
      const networkTryAgainButton = await metaMaskPage.evaluate(() => {
        return !!document.querySelector('.popover-wrap .mm-button-primary');
      });
      if(networkTryAgainButton) metaMaskPage.click('.popover-wrap .mm-button-primary');
      await metaMaskPage.waitForTimeout(1e3);
      await _profile.clickDifferentPage(metaMaskPage, '[data-testid="unlock-submit"]');
    });;
    wallet = await logTextFromElement(metaMaskPage, '.mm-box.mm-text.mm-text--inherit.mm-box--color-primary-default .mm-box.mm-box--display-flex');

    // if(!METAMASK_ONLY_ONE_ACCOUNT) {
    //   await metaMaskPage.waitForSelector('[data-testid="eth-overview-send"]').catch(async (e) => {
    //     const networkTryAgainButton = await metaMaskPage.evaluate(() => {
    //       return !!document.querySelector('.popover-wrap .mm-button-primary');
    //     });
    //     if(networkTryAgainButton) metaMaskPage.click('.popover-wrap .mm-button-primary');
    //     await metaMaskPage.waitForTimeout(1e3);
    //     await _profile.clickDifferentPage(metaMaskPage, '[data-testid="unlock-submit"]');
    //   });
    //   await _profile.clickDifferentPage(metaMaskPage, '[data-testid="eth-overview-send"]', true);
    //   await metaMaskPage.waitForSelector('.ens-input.send__to-row');
    //   const partialWallet = await logTextFromElement(metaMaskPage, '.mm-box--color-text-alternative');
    //   await metaMaskPage.evaluate((partialWallet) => {
    //     const isMatchingWallet = (element, partialText) => {
    //       const fullText = element.textContent.trim().toLowerCase();
    //       const partialTextLower = partialText.toLowerCase();
    //       const startText = partialTextLower.slice(0, 5);
    //       const endText = partialTextLower.slice(-4);
    //       const matchesStart = fullText.startsWith(startText);
    //       const matchesEnd = fullText.endsWith(endText);
    //       return matchesStart && matchesEnd;
    //     };

    //     const pElements = Array.from(document.querySelectorAll('p.mm-box.mm-text.send__select-recipient-wrapper__group-item__subtitle.mm-text--body-md.mm-box--color-text-alternative'));
    //     const targetElement = pElements.find(element => isMatchingWallet(element, partialWallet));
    //     if(!targetElement) {
    //       return;
    //     }

    //     const clickableParent = targetElement.closest('.box.send__select-recipient-wrapper__group-item.box--padding-4.box--flex-direction-row');
    //     if(!clickableParent) {
    //       return;
    //     }

    //     clickableParent.click();
    //   }, partialWallet);

    //   await metaMaskPage.waitForSelector('.ens-input__selected-input__subtitle');
    //   wallet = await logTextFromElement(metaMaskPage, '.ens-input__selected-input__subtitle');
    // }
    await metaMaskPage.goto(`chrome-extension://${metamaskID}/home.html#`);
    await metaMaskPage.waitForTimeout(1e3);
    _profile.log(`wallet:`, wallet);

    // await metaMaskPage.click('.mm-box--display-flex.mm-box--flex-direction-column.mm-box--align-items-center.mm-box--color-text-default > div > div > button > span.mm-box.mm-text.mm-text--inherit.mm-text--ellipsis.mm-box--display-flex.mm-box--gap-2.mm-box--align-items-center.mm-box--color-text-default > span');
    // clipboardy.read().then(text => {
    //   wallet = text;
    //   console.log(`[PROFILE - ${profile}] wallet:`, wallet)
    // });

    return resolve({ isLoggedMetaMask: true, wallet: wallet });
  });
}

function escapeCSSSelector(selector) {
  return selector.replace(/([:/#\[\]\(\)])/g, '\\$1');
}

async function doQuest(quest, page, timeoutId, _profile, TODO_QUESTS) {
  const {profile, browser} = _profile;
  let questTimeout;

  return Promise.race([
    new Promise(async (resolve) => { // Обертываем логику в промис
      let randomInterval, questExecuted;
      _profile.log(`start quest:`, quest)
      _profile.startQuestTime = Date.now();

      questExecuted = { status: false, name: quest };
      let multiple = false;
      let noButtons = false;
      let bonusColumnClicked = false;
      let CUBEsRewardsClaimed = false;
      let CUBEtries = 0;
      let step = 0;
      let bonusStage = false;

      randomInterval = () => {
        timeoutId = setTimeout(async () => {
          if(quest === 'LineaPark') {
            multiple = true;
          }
          let buttons = await getButtonTextsFromContainers(page, questExecuted, multiple, noButtons);
          if(DEBUG_QUESTS_BUTTONS && IS_TEST) {
            _profile.log('Quest step buttons:');
            buttons.forEach((button, index) => {
              console.log(`${index}:`);
              Object.keys(button).forEach(key => {
                console.log(`   ${key}:`, button[key]);
              });
            });
          }
          if(IS_TEST) console.log(questExecuted, 'multiple:', multiple, 'noButtons', noButtons, 'bonusColumnClicked', bonusColumnClicked, 'step', step, 'bonus', questsData[quest]?.bonus)

          if(questsData[quest]?.bonus) {
            //Если вдруг квест закончен, то мог остаться только бонус, так что стадию сразу меняем
            const completedTextBottomBar = await page.evaluate(() => {
              const elements = document.querySelectorAll('.fixed.inset-x-none.bottom-none.z-1.flex p');
              for(let element of elements) {
                if(element.textContent.includes('Completed')) {
                  return true;
                }
              }

              return false;
            });

            if(completedTextBottomBar) {
              await page.keyboard.press('PageDown');
              await delay(3500); //тут надо ждать, иначе нихера не сработает после скорлла

              const bonusElementSelector = await page.evaluate(() => {
                // Находим все элементы, которые могут потенциально содержать текст "BONUS:"
                const elements = [...document.querySelectorAll('div')];
                const bonusElement = elements.find(el => el.textContent.includes('BONUS:') && el.classList.contains('bg-background-tertiary'));
                return bonusElement ? bonusElement.className : null;
              });

              if(bonusElementSelector) {
                // console.log('FoundbonusElementSelector');
                if(!bonusColumnClicked) {
                  const classes = bonusElementSelector.split(' '); // Разделяем классы
                  const selector = classes.map(cls => `.${cls.replace(':', '\\:')}`).join(''); // Формируем селектор
                  await safeClick(page, selector, profile);
                  bonusStage = true;
                  questExecuted.status = true;
                  bonusColumnClicked = true;
                }
              } else {
                // console.log('.bg-background-tertiary class not found, 99.9% quest completed');
                clearTimeout(timeoutId);
                clearTimeout(questTimeout);

                await page.close();
                return resolve({success: true, bonusStage: bonusStage});
              }
            }
          }

          if(buttons.length == 0 && quest !== 'CUBEs' && step > 0) {
            clearTimeout(timeoutId);
            clearTimeout(questTimeout);

            await page.close();
            return resolve({success: true, bonusStage: bonusStage});
          }

          if(buttons.length == 0 && quest === 'CUBEs') {
            //Если вдруг квест закончен
            const completedText = await page.evaluate(() => {
              const elements = document.querySelectorAll('.fixed.inset-x-none.bottom-none.z-1.flex p');
              for(let element of elements) {
                if(element.textContent.includes('Completed')) {
                  return true;
                }
              }

              return false;
            });

            if(completedText) {
              clearTimeout(timeoutId);
              clearTimeout(questTimeout);

              await page.close();
              return resolve({success: true, bonusStage: bonusStage});
            }

            if(CUBEsRewardsClaimed) {
              _profile.log('CUBEs claimed, reload and waiting for completed status')
              await delay(8e3);
              await page.reload();
            }

/*             if(CUBEsRewardsClaimed) {
              const exitExists = await page.evaluate(() => {
                const element = document.querySelector('.cursor-pointer.select-none.items-center.absolute');
                return !!element;
              });

              if(exitExists) {
                await safeClick(page, '.cursor-pointer.select-none.items-center.absolute', profile);
                clearTimeout(timeoutId);
                clearTimeout(questTimeout);

                await page.close();
                return resolve(true);
              }
            } */

            if(CUBEtries > 4) noButtons = true;
            CUBEtries++;
          }

          for(const button of buttons) {
            let selector = escapeCSSSelector(button.selector);
            if(quest === 'LineaPark') {
              const completedCUBEsOnLineaParkPage = 'div.flex.w-full.min-w-0.grow.flex-col.justify-between.gap-sm.p-sm.h-full > div.flex.gap-xxs > p.body.text-3xs.text-content-primary';

              if(button.text === 'Open Quest' && !buttons.some(b => b.selector === completedCUBEsOnLineaParkPage)) {
                // return resolve({success: false, bonusStage: bonusStage})

                await delay(1800);
                await safeClick(page, selector, profile);
                let currentTabs = await browser.pages(); // Получаем список текущих открытых вкладок

                const isDrop = await prepareAndDoQuest(_profile, "CUBEs", currentTabs, TODO_QUESTS, timeoutId)
                if(isDrop !== undefined) {
                  return resolve({success: false, bonusStage: bonusStage})
                }
                await page.waitForTimeout(2e3);
              }

              if(button.text === 'Open Layer3 Profile' && !buttons.some(b => b.selector === completedCUBEsOnLineaParkPage)) {
                //CUBEs tab delay - 20e3
                let newPage;
                [newPage] = await Promise.all([
                  switchToNewTab(browser, false, true, page, 20e3),
                  safeClick(page, selector, profile)
                ]);
                // const newPage = await switchToNewTab(browser, false, true, page, 20e3)
                await newPage.close();
                await page.waitForTimeout(4e3);
                noButtons = false;
                multiple = false;

                let continueBtn = '.flex.h-full.w-full.max-w-quest-content .relative.flex.w-full.justify-between button.bg-brand-primary';
                await safeClick(page, continueBtn, profile);
              }
              if(button.text === 'Completed' && button.selector !== completedCUBEsOnLineaParkPage) {
                clearTimeout(timeoutId);
                clearTimeout(questTimeout);
                await page.close();
                await page.waitForTimeout(4e3);
                return resolve({success: true, bonusStage: bonusStage});
              }
              // if(button.text === 'Open Layer3 Collection') {
              //   await safeClick(page, selector, profile);
              //   const newTab = await switchToNewTab(browser, false, true, page)
              //   await newTab.close();
              //   await page.waitForTimeout(20e3);

              //   let continueBtn = '.flex.h-full.w-full.max-w-quest-content .relative.flex.w-full.justify-between button.bg-brand-primary';
              //   await safeClick(page, continueBtn, profile);
              //   await delay(2e3);

              //   clearTimeout(timeoutId);
              //   clearTimeout(questTimeout);
              //   return resolve(true);
              // }
            }

            if(quest === 'CUBEs') {
              if(button.text === 'Claim Rewards' && !CUBEsRewardsClaimed) {
                await safeClick(page, selector, profile);

                let extensionTarget = await waitForMetaMaskTarget(_profile.browser, _profile.metamaskID, _profile.profile);
                if(extensionTarget) {
                  _profile.log(`Found metamask extension popup-window:`, extensionTarget.url());
                  let extPage = await extensionTarget.page();
                  let signButtonSelector = '[data-testid="page-container-footer-next"]';
                  await delay(2e3);

                  const signButton = await extPage.evaluate(() => {
                    return !!document.querySelector('[data-testid="page-container-footer-next"]');
                  });
                  if(signButton) {
                    _profile.log('sign btn found')
                    await extPage.waitForSelector(signButtonSelector) //Next button
                    await _profile.clickDifferentPage(extPage, signButtonSelector) //Next button
                    _profile.log('Click metamask confirm CUBEs transactions with medium fee.')
                    //Если вдруг кнопка сырая
                    await delay(2e3);
                    extensionTarget = await waitForMetaMaskTarget(_profile.browser, _profile.metamaskID, _profile.profile, true);
                    if(extensionTarget) {
                      extPage = await extensionTarget.page();
                      await extPage.waitForSelector(signButtonSelector) //Next button
                      await _profile.clickDifferentPage(extPage, signButtonSelector) //Next button
                    }
                    CUBEsRewardsClaimed = true;
                    noButtons = true;

                    _profile.log('Try to drop quest for next time and later check CUBE mint');
                    return resolve({success: false, bonusStage: false, drop: true})
                    // await page.reload();
                    // await page.waitForSelector('.heading.text-center.text-xl');
                  } else {
                    _profile.log('No MM. sign button, try again!')
                    CUBEsRewardsClaimed = false;
                  }
                  // clearTimeout(timeoutId);
                  // clearTimeout(questTimeout);

                  // await delay(30e3)
                  // return resolve(true);
                }
              }

              // if(button.text === 'Open Linea Collection' || button.text === 'Introducing CUBEs') multiple = true;
              // //Last text on page after claim rewards
              if(button.text === 'DeFi on Linea') {
                clearTimeout(timeoutId);
                clearTimeout(questTimeout);

                await page.close();
                return resolve({success: true, bonusStage: bonusStage});
              }
            }

            if(button.text === 'Continue' && selector.includes('bg-red-primary')) {
              clearTimeout(timeoutId);
              clearTimeout(questTimeout);

              await page.close();
              return resolve({success: false, bonusStage: bonusStage});
            }
            if(button.text === 'Begin' && !selector.includes('[disabled]')) {
              step++;
              await safeClick(page, selector, profile);
            }

            if(button.text === 'Continue' && !selector.includes('[disabled]') && !selector.includes('bg-red-primary') && !buttons.some(b => b.text === 'Connect Wallet') && !buttons.some(b => b.text === 'Log in to start') && !buttons.some(b => b.text === 'Verify') && !buttons.some(b => b.text === 'Skip')) {
              step++;
              if(LOG_SAFE_CLICKS) _profile.log('temp-continue-click', button.selector)

              for(const buttonId of questsData[quest].quizBTNs) {
                let found = await findElementById(page, buttonId);
                if(found) {
                  await safeClick(page, `[id="${buttonId}"]`, profile);
                  await page.waitForTimeout(2e3);
                }
              }
              if(LOG_SAFE_CLICKS) _profile.log('temp-continue-click.2', button.selector)
              await safeClick(page, selector, profile);
            }

            if(button.text === 'Skip') {
              if(questsData[quest]?.bonus && buttons.some(b => b.text.includes('BONUS'))) {
                bonusStage = true;
                // _profile.log('Bonus page & stage now');
                step++;
              } else {
                step++;
                await safeClick(page, selector, profile, false, 1);
                break;
              }
            }

            if(button.text === 'Verify') {
              step++;
              if(LOG_SAFE_CLICKS) _profile.log('Verify click.2', button.selector)
              await safeClick(page, selector, profile, false);
            }
          }

          // await page.waitForTimeout(3e3)
          // doQuest(quest, page)
          if(step > 0) questExecuted.status = true;
          randomInterval(); // Рекурсивно вызываем функцию для следующего интервала
        }, Math.random() * 3000 + 2000); // Задержка от 2 до 5 секунд на следующий шаг
      }

      randomInterval();
    }),
    new Promise((resolve, reject) => {
      // questTimeout = setTimeout(() => {
      //   console.log(`!!!Quest ${quest} freezed!!!. Restart quest...`);
      //   restartQuest(); // Перезапуск квеста при зависании
      // }, FREEZE_QUEST_RESTART_INTERVAL);
    })
  ]);

}

async function checkNotCompletedQuests(page, href) {
  return page.evaluate((href) => {
    // Находим элемент a по его href
    const link = document.querySelector(`a[href="${href}"]`);
    // console.log('link', link)
    if (!link) return false; // Если элемент не найден, возвращаем false

    // Находим вложенный див с указанными классами
    const div = link.querySelector('.flex.items-center.justify-center.rounded-circle');
    // console.log('div', div)
    if (!div) return false; // Если див не найден, возвращаем false

    // Проверяем наличие класса bg-brand-primary у дива
    if(!div.classList.contains('bg-brand-primary')) {
      // console.log('classList', div.classList)
    }
    return div.classList.contains('bg-brand-primary');
  }, href);
}

async function prepareAndDoQuest(_profile, questName, currentTabs, TODO_QUESTS, timeoutId) {
  const page = _profile.lineaParkPage;
  const {profile, browser, wallet} = _profile;
  if(IS_TEST) _profile.log('prepare quest:', questName);
  let newPage;
  let timeout = 10e3;
  if(questName === 'CUBEs') timeout = 20e3;

  try {
    [newPage] = await Promise.all([
      switchToNewTab(browser, currentTabs, true, page, timeout),
      _profile.click(`a[href="${questsData[questName].href}"]`, true)
    ]);
  } catch(err) {
    _profile.log('was not able to open new tab or it has opened in current');
  }

  const questData = questsData[questName];
  if(!newPage || !newPage.url().endsWith(questData.href)) {
    if(newPage) {
      _profile.log('!!!Opened wrong quest?!!!', newPage.url(), questData.href);
      await newPage.close();
    }

    if(IS_TEST) _profile.log('going back to park');
    await bringPageToFront(page, newPage);
    await _profile.goToPark();
    await delay(3e3);
    if(questName === 'CUBEs') {
      console.log('Return and find what to do next!');
      return;
    }
    return prepareAndDoQuest(_profile, questName, currentTabs, TODO_QUESTS, timeoutId);
  }

  await newPage.waitForTimeout(3e3);
  let result = await doQuest(questName, newPage, timeoutId, _profile, TODO_QUESTS);
  if(TODO_QUESTS.has(questName)) TODO_QUESTS.delete(questName);

  if(result.success) {
    if(!sideQuests.includes(questName)) {
      if(IS_TEST) _profile.log('result.1 bonusStage', result.bonusStage)
      setExp(profile, wallet, questName, true, result.bonusStage)
    }

    _profile.log(`completed quest!`, questName);
  } else {
    result.bonusStage ? _profile.log(`!!!Failed to complete BONUS!!!`, questName) : _profile.log(`!!!Failed to complete quest!!!`, questName);

    if(!sideQuests.includes(questName)) {
      if(IS_TEST) _profile.log('result.2 bonusStage', result.bonusStage)
      setExp(profile, wallet, questName, false, result.bonusStage)
    }
  }

  if(!sideQuests.includes(questName)) {
    await bringPageToFront(page, newPage);
    await page.reload();
    await page.waitForSelector('a[href="/quests/linea-park-entrance"]')
    await delay(DELAY_BETWEEN_QUESTS[0], DELAY_BETWEEN_QUESTS[1]);
  } else {
    //close side-quest and return to main
    // await newPage.close();
    if(result.drop) return true;
  }
  await page.waitForTimeout(2e3);
}

function getMetaMaskExtensionUrlPrefix(extensionID) {
  return `chrome-extension://${extensionID}`;
}

async function waitForMetaMaskTarget(browser, extensionID, profileId, noLoop = false) {
  const extensionUrlPrefix = getMetaMaskExtensionUrlPrefix(extensionID);

  return new Promise((resolve, reject) => {
    let timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      resolve(false);
    }, 60000);

    const intervalId = setInterval(async () => {
      if(IS_TEST) console.log('try to get targets here MM.1')
      const targets = await browser.targets();
      if(IS_TEST) console.log('try to get targets here MM')
      const extensionTarget = targets.find(target =>
        target.url().startsWith(extensionUrlPrefix) &&
        !target.url().includes('home.html') &&
        !target.url().includes('background.html')
      );

      if(noLoop) {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        resolve(false);
      }

      if(extensionTarget) {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        if (IS_TEST) targets.find(target => console.log(`Ext target profile ${profileId} ->`, target.url()));
        resolve(extensionTarget);
      }
    }, 1000);
  });
}

async function puppeteerRun(profile, profileUniqueId) {
  running++;
  const _profile = new Profile(profile);
  const promise = (async () => {
    let wsEndpointUrl, timeoutId, browser;

    const TODO_QUESTS = new Set();
    let { a, b } = getWindowPosition(y, BROWSER);
    if(!BROWSER.grid) a = 0, b = 0;
    y++; //browser reserved;
    try {
      const response = await axios.get(`http://local.adspower.com:${ADS_PORT}/api/v1/browser/start?serial_number=${profile}&ip_tab=0&launch_args=["--window-size=${BROWSER.windowWidth},${BROWSER.windowHeight}", "--window-position=${a},${b}"]`);
      if (response.data && response.data.data && response.data.data.ws && response.data.data.ws.puppeteer) {
        wsEndpointUrl = response.data.data.ws.puppeteer;
      } else {
        _profile.logError(`[ADSBROWSER ERROR] ---->`, response.data.msg);
      }
    } catch (error) {
      _profile.logError('Wtf error:', error);
      return;
    }

    try {
      //const wsEndpointUrl = `ws://127.0.0.1:9222/devtools/browser/30d09e6f-8c56-4d70-ab63-c56cf47b68c2`;
      browser = await puppeteer.connect({
        browserWSEndpoint: wsEndpointUrl,
        defaultViewport: null,
        ignoreHTTPSErrors: true,
        timeout: 15000,
      });
      // Дальнейшие действия с браузером

      // let pages = await browser.pages();
      // let page = pages[0];
      // const page = await browser.newPage();
      // await page.goto('https://layer3.xyz/quests/linea-satoshi-universe', {timeout: 60e3, waitUntil: 'load'});
      // await addCursorToPage(page);
      // await page.goto('https://layer3.xyz/linea-park', {timeout: 60e3, waitUntil: 'load'});
      // await delay(5000);
      // const cursor = page[CURSOR_SYMBOL];
      // cursor.forceToggleRandomMove(false);

      _profile.browser = browser;
      _profile.log(`Started!`);
    } catch (error) {
      _profile.logError(`Ошибка подключения:`, error);
      return;
    }

    if(!browser) {
      return;
    }

    // let pages = await browser.pages();
    // // let page = pages[2];
    // let page = pages[3];
    // console.log(page.url())

    // let buttons = await getButtonTextsFromContainers(page, { status: true, name: 'LineaPark' }, true, false);
    // if(DEBUG_QUESTS_BUTTONS && IS_TEST) {
    //   _profile.log('Quest step buttons:');
    //   buttons.forEach((button, index) => {
    //     console.log(`${index}:`);
    //     Object.keys(button).forEach(key => {
    //       console.log(`   ${key}:`, button[key]);
    //     });
    //   });
    // }

    // return;
    // let page = await browser.newPage();
    // await delay(1e3)
    // console.log('1')
    // return;

    if(CAPTCHA_MONSTER) {
      const result = await setCapMonsterCloud(browser);
      if(!result) {
        _profile.log('No captchaMonster API_KEY!')
        return false;
      }
      _profile.log('Check and set captchaMonster API_KEY')
    }

    const metamaskID = await detectMetaMaskVersion(browser);
    _profile.metamaskID = metamaskID;

    const { isLoggedMetaMask, wallet } = await checkMetaMaskLogin(_profile);
    if(!isLoggedMetaMask && LOGIN_METAMASK_FIRST) return;

    _profile.isLoggedMetaMask = true;
    _profile.wallet = wallet;

    async function start() {
      //Отправляем в нокаут, если не залогинит
      setTimeout(() => {
        if(_profile.loggedIn == 0) {
          throw new Error("Login timeout 180s, restart");
        }
      }, 300e3);

      const restartInterval = setInterval(() => {
        if((Date.now() - _profile.startQuestTime) / 1000 > FREEZE_QUEST_RESTART_INTERVAL) {
          throw new Error(`Quest work timeout FREEZE_QUEST_RESTART_INTERVAL, restart`);
        }
      }, 10e3);

      let pages = await browser.pages();
      let lineaParkPage = null;
      //let pages1 = await browser.pages();
      //let page = pages1[0];
      for(const page of pages) {
        const title = await page.title();

        // processAnyNewPage(page);

        if(title === "Linea Park | Layer3") {
          lineaParkPage = page;
          _profile.setLineaPage(lineaParkPage);
          await bringPageToFront(lineaParkPage);
          await lineaParkPage.reload();
          break;
        }
      }

      if(!lineaParkPage) {
        _profile.log(`Open LineaPark page...`)
        lineaParkPage = await browser.newPage();
        _profile.setLineaPage(lineaParkPage);
        try {
          await _profile.goToPark();
        } catch (e) {
          _profile.log(`Goto #1`, e)
        }

        const url = new URL(lineaParkPage.url());
        const domain = url.hostname;

        const pageTitle = await lineaParkPage.title();
        const frames = lineaParkPage.frames().filter(frame => {
          if (pageTitle === 'Just a moment...') {
              return frame.url().includes('cloudflare') || frame.url().includes(domain)
          }
        });

        let count = 0;
        const cloudflareInterval = setInterval(async () => {
          count++;
          if(count > 2) clearInterval(cloudflareInterval)
          if(frames.length > 0) {
            _profile.log('Got cloudflare frame')
            const elements = await lineaParkPage.$$('iframe');
            for (const element of elements) {
                _profile.log('Captcha click')
                await element.click();
            }

            try {
              for(var item of frames) {
                  try {
                    await item.click('body');
                    var active_frame = await item.childFrames()[0]
                    await active_frame.click('[type="checkbox"]');
                  } catch (err) {
                    _profile.log(err);
                  }
              }
              clearInterval(cloudflareInterval);
            } catch (err) {
              clearInterval(cloudflareInterval);
              _profile.log(err);
            }
          }
        }, 5e3);
      }

      if(!lineaParkPage) {
        _profile.log('No Linea Park page')
        return;
      }

      await lineaParkPage.waitForSelector('a[href="/quests/linea-park-entrance"]', {timeout: 70e3})
      let signInButtonText = await logTextFromElement(lineaParkPage, '.bg-background-quaternary.text-content-primary');

      if(signInButtonText === 'Sign in') {
        signInButtonText = null;
        _profile.log(`Start sign in process.`);
        //fs.appendFile(`./errors/${profile}_Linea_SignIn.txt`, 'You have to sign in first!\n');
        await _profile.click('.text-content-primary.shadow-\\[0_4px_0_0\\].shadow-contrast-high\\/25.hover\\:bg-contrast-low.active\\:shadow-none.rounded-md.px-md.py-\\[9px\\].text-3xs'); // Sign In button
        await lineaParkPage.waitForSelector('#radix-\\:r6\\:-content-evm > div > button:nth-child(1)');
        await _profile.click('#radix-\\:r6\\:-content-evm > div > button:nth-child(1)');
        await lineaParkPage.waitForSelector('#radix-\\:r3\\: > div > div > div:nth-child(3) > div > div.text-center.font-medium.text-content-primary'); //Connect wallet requesting connection text modal window

        //Подключаемся к отдельному окну метамаска
        let extensionTarget = await waitForMetaMaskTarget(browser, metamaskID);

        if(extensionTarget) {
          _profile.log(`Found metamask extension popup-window:`, extensionTarget.url());
          let page = await extensionTarget.page();
          let signButtonSelector = '[data-testid="page-container-footer-next"]';
          await page.waitForSelector(signButtonSelector) //Next button
          await _profile.clickDifferentPage(page, signButtonSelector) //Next button

          _profile.log('MM -> target-step.2')
          extensionTarget = await waitForMetaMaskTarget(browser, metamaskID);
          if(extensionTarget) {
            page = await extensionTarget.page();
            _profile.log('MM -> target-step.3')
            await page.waitForSelector(signButtonSelector) //Connect button
            await _profile.clickDifferentPage(page, signButtonSelector) //Connect button

            extensionTarget = await waitForMetaMaskTarget(browser, metamaskID);
            if(extensionTarget) {
              page = await extensionTarget.page();
              _profile.log('MM -> target-step.4')

              try {
                await page.waitForSelector(signButtonSelector) //Sign button
                await _profile.clickDifferentPage(page, signButtonSelector) //Sign button
              } catch (error) {
                  let errString = error.toString();
                  if(errString.includes('Target closed')) {
                    console.log('Target closed, change target and click again!')
                    const targets = await browser.targets();
                    const extensionUrlPrefix = getMetaMaskExtensionUrlPrefix(metamaskID);

                    extensionTarget = targets.find(target =>
                      target.url().startsWith(extensionUrlPrefix) && !target.url().includes('home.html') && !target.url().includes('background.html')
                    );
                  if(extensionTarget) {
                    await page.waitForSelector(signButtonSelector) //Sign button
                    await _profile.clickDifferentPage(page, signButtonSelector) //Sign button
                  }
                }
              }

            }
          }

          try {
            await lineaParkPage.waitForSelector('#toaster-portal > div.fixed.left-1\\/2.top-1\\/2.flex.-translate-x-1\\/2.-translate-y-1\\/2.flex-col.items-center.justify-center > div > button'); //Continue button on captcha page
            // interval every 5 seconds
            await waitAndClickDisabledButton(lineaParkPage, '#toaster-portal > div.fixed.left-1\\/2.top-1\\/2.flex.-translate-x-1\\/2.-translate-y-1\\/2.flex-col.items-center.justify-center > div > button', profile);
          } catch (error) {
            const errString = error.toString();
            if(errString.includes("TimeoutError: Waiting for selector")) {
              _profile.log('No captcha, we are lucky')
            } else {
              _profile.log(error)
            }
          }

          await delay(randomBetween(5e3, 8e3))
          await lineaParkPage.reload();
          await lineaParkPage.waitForSelector('a[href="/quests/linea-park-entrance"]') // тут необходимо снова ждать селектор хрефа на странице когда залогинились, чтобы получить квесты. иначе не успевает обновиться дом и мы получаем нулл
        } else {
          _profile.log(`No extension target, close browser`);
        }
      }

      //Пока временно добавил, потому что бывало не залогинило у Ромы и продолжало кайфовать по сайту
      signInButtonText = await logTextFromElement(lineaParkPage, '.bg-background-quaternary.text-content-primary');
      if(signInButtonText === 'Sign in') {
        _profile.log('Not logged in!')
        return;
      }

      _profile.loggedIn = 1;
      if(!RUN_QUESTS) return;
      const currentTabs = await browser.pages(); // Получаем список текущих открытых вкладок
      const achievedQuests = await getAchievedQuests(_profile.profile);
      const completedQuests = []; // квесты с сайта смотрит

      for(const quest of Object.keys(questsData)) {
        let isBonusQuestNotCompleted = true;
        isBonusQuestNotCompleted = questsData[quest].bonus && !achievedQuests.some(q => q.name === quest && q.bonusExp !== undefined && q.bonusExp !== '' && q.bonusExp !== '-1');

        const hasClass = await checkNotCompletedQuests(lineaParkPage, questsData[quest].href);
        if(hasClass || isBonusQuestNotCompleted) {
          //Если вдруг неверный результат в CSV записало, перепроверим все квесты и запишем те что не выполнены, снова.
          //writeToCSV(_profile.profile, _profile.wallet, quest, '');
          //Проверяем только указанные, если заданы квесты выполнения вручную
          if(SELECTED_QUESTS.length > 0) {
            if(quest !== 'ParkEntrance' && quest !== 'SecurityLearn' && quest !== 'VoyageGaming' && quest !== 'MetamaskPrioritizes') {
              const SELECTED_QUESTS_lowercase = SELECTED_QUESTS.map(item => item.toLowerCase());
              const quest_lowercase = quest.toLowerCase();

              if(!SELECTED_QUESTS_lowercase.includes(quest_lowercase)) continue;
            }
          }

          if(IS_TEST) _profile.log(`need to do - ${quest}:`, hasClass);
          TODO_QUESTS.add(quest);
        } else {
          if(IS_TEST) _profile.log('completed', quest)
          //ХП прогружается не сразу, а через секунды 3, сайт лагает у них.
          //let totalXP = await logTextFromElement(lineaParkPage, 'div > div.body.text-content-primary');
          completedQuests.push(quest);
          setExp(profile, wallet, quest, true);
        }
      }

      if(!IS_TEST) await delay(randomBetween(DELAY_START[0], DELAY_START[1]));
      let route = [];

      for(let quest of priorityQuests) {
        if(TODO_QUESTS.has(quest)) {
          route.push(quest);
        }
      }

      let otherQuests = Array.from(TODO_QUESTS.keys()).filter(quest => !priorityQuests.includes(quest));
      otherQuests = shuffleArray(otherQuests);
      route = route.concat(otherQuests);

      _profile.log(`route:`, route.join(' -> '));
      for (const quest of route) {
        await prepareAndDoQuest(_profile, quest, currentTabs, TODO_QUESTS, timeoutId);
      }

      //End and close browser
      // if(!IS_TEST) {
        _profile.log(`End. Browser will be closed with delay`)
        await delay(randomBetween(...DELAY_BROWSER_CLOSE));
        await browser.close();

        _profile.log(`Browser closed`)
        return true;
      // }
    }

    return start();
  })();

  return promise.then((canExit) => {
    //_profile.log('canExit', !!canExit);
    if(canExit) {
      process.exit(0); // 0 success
    }
    if(!canExit) {
      setTimeout(() => {
        _profile.logError(`Restart P${profile} canExit false (...)`);
        process.exit(1);
      }, 7e3);
    }
  }, (err) => {
    _profile.logError('run error', err);

    setTimeout(() => {
      _profile.logError(`Restart ${profile} after promise error (..)`);
      process.exit(1);
    }, 7e3);
  }).finally(() => {
    running--;
  });
}