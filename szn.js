import puppeteer from 'puppeteer-core';
import fetch from 'node-fetch';
import axios, { all } from 'axios';
import path from 'path';
import { spawn } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import GhostCursor from './ghost-cursor/lib/spoof.js';
import fs from 'fs/promises';
import { getRandomInt, randomBetween, getWindowPosition, getProfilesFromFile, shuffleArray, delay, getRandomElementFromSet, detectMetaMaskVersion, XP_TABLE, getProfilesByKey } from './utils.js';
//config

import { RUN_QUESTS, DELAY_BETWEEN_QUESTS, DELAY_START, DELAY_BROWSER, DELAY_BROWSER_CLOSE, LOGIN_METAMASK_FIRST, SHUFFLE_PROFILES, DEBUG_QUESTS_BUTTONS, LOG_SAFE_CLICKS, ADD_CURSOR, METAMASK_PW, METAMASK_PW_2, BROWSER, ADS_PORT, CAPTCHA_MONSTER, CAPTCHA_MONSTER_API_KEY, FREEZE_QUEST_RESTART_INTERVAL, API_KEY, CLEAR_CACHE_FILES_AND_IMAGES } from './config.js'

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

const getAndRefreshProfiles = async () => {
  if(PROFILE) return;
  let defaultFileMode = true;
  let mintedFileName = null;
  let needToDoProfiles = [];

  // if(SELECTED_QUESTS.length == 1) {
    try {
      mintedFileName = `done_${SELECTED_QUESTS[0]}.txt`;

      const data = await fs.readFile(`./done/${mintedFileName}`, 'utf8');
      const mintedWallets = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      if(Object.keys(walletsToProfiles).length == 0) walletsToProfiles = await getProfilesByKey(API_KEY);
      needToDoProfiles = mintedWallets.map(wallet => walletsToProfiles[wallet]).filter(id => id !== undefined);

      defaultFileMode = false;
    } catch (err) {
      defaultFileMode = true;
      // console.log(err)
    }
  // }

  try {
    if(defaultFileMode) needToDoProfiles = await getProfilesFromFile();

    const profilesToAdd = needToDoProfiles.filter(profile => !processedProfiles.has(profile));
    if(profilesToAdd.length > 0) {
      console.log('ADDED PROFILES:', profilesToAdd)
      // profiles = profiles.concat(profilesToAdd);
      profiles = Array.from(new Set([...profiles, ...profilesToAdd]));
      profilesToAdd.forEach(profile => processedProfiles.add(profile));
      countProfiles += profilesToAdd.length;
      defaultFileMode ? console.log(`New profiles added, total now: ${countProfiles} | profiles.txt`) : console.log(`New profiles added, total now: ${countProfiles} | ${mintedFileName}`);

      if(SHUFFLE_PROFILES) {
        profiles = shuffleArray(profiles);
      }
      if(LIMIT_PROFILES > 0) {
        profiles = profiles.slice(0, LIMIT_PROFILES);
      }

      if (/*!isMasterRunning && */ checkNewProfilesTimeout !== null && !PROFILE /* slave */) {
        isMasterRunning = true;
        runProfilesSequentially(profiles);
      }
    }
  } catch (err) {
    console.error('Error updating profiles:', err);
  }

  checkNewProfilesTimeout = setTimeout(() => {
    getAndRefreshProfiles();
  }, 5e3);
};

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

const priorityQuests = ['Introduction', 'LineaLXP', 'NFTLearn', 'NFTScams', 'Snaps'];
const sideQuests = [];
const questsData = {
  Introduction: { href: "/v2/quests/introduction-to-linea-culture-szn", quizBTNs: [] },
  LineaLXP: { href: "/v2/quests/linea-lxp", quizBTNs: [] },
  NFTLearn: { href: "/v2/quests/nft-learn", quizBTNs: ["a1"] },
  NFTScams: { href: "/v2/quests/how-to-avoid-nft-scams", quizBTNs: ["6acd06a6-9d8c-422b-aa5b-f8c2f64017d4"] },
  Snaps: { href: "/v2/quests/what-are-metamask-snaps", quizBTNs: ["6acd06a6-9d8c-422b-aa5b-f8c2f64017d4"] },
  Octomos: { href: "/v2/quests/w1-octomos", quizBTNs: [] },
  CrazyGang: { href: "/v2/quests/w1-crazy-show", quizBTNs: [] },
  Push: { href: "/v2/quests/w1-push", quizBTNs: [] },
  Wizards: { href: "/v2/quests/w1-wizards-of-linea", quizBTNs: [] },
  Efrogs: { href: "/v2/quests/w1-efrogs", quizBTNs: [] },
  Voting1: { href: "/v2/quests/week-1-voting", quizBTNs: ["a1", "a2", "a3", "a4", "a5"] },
  Satoshi_W2: { href: "/v2/quests/w2-satoshi-universe", quizBTNs: [] },
  Linus: { href: "/v2/quests/w2-linus", quizBTNs: [] },
  Yooldo_W2: { href: "/v2/quests/w2-yooldo", quizBTNs: [] },
  FrogWars_W2: { href: "/v2/quests/w2-frog-wars", quizBTNs: []},
  ACG_W2: { href: "/v2/quests/w2-acg", quizBTNs: []},
  Toad: { href: "/v2/quests/w2-toad", quizBTNs: []},
  Voting2: { href: "/v2/quests/week-2-voting", quizBTNs: ["a1", "a2", "a3", "a4", "a5", "bf568148-42e6-40e8-af71-d9194217a197"] },
  Ascend: { href: "/v2/quests/w3-ascendtheend-1", quizBTNs: [] },
  Send_W2: { href: "/v2/quests/w3-sendingme", quizBTNs: [] },
  Townstory_W2: { href: "/v2/quests/w3-townstory", quizBTNs: [] },
  Danielle: { href: "/v2/quests/w3-danielle-zosavac", quizBTNs: [] },
  Demmortal: { href: "/v2/quests/w3-demmortal", quizBTNs: [] },
  Foxy: { href: "/v2/quests/w3-foxy", quizBTNs: [] },
  Voting3: { href: "/v2/quests/week-3-voting", quizBTNs: ["a1", "a2", "a3", "a4", "a5", "3fa53bea-f175-4f74-aae9-ca2dda68d490"] },
  Coop: { href: "/v2/quests/w4-coop-records", quizBTNs: [] },
  Fruit: { href: "/v2/quests/w4-forbidden-fruit", quizBTNs: [] },
  FruitCrux: { href: "/v2/quests/w4-forbidden-fruit-crux", quizBTNs: [] },
  FruitStonez: { href: "/v2/quests/w4-forbidden-fruit-stonez-the-organic", quizBTNs: [] },
}

//y - Count of reserved launches browsers
let x = 0;
let y = 0;
let running = 0;
let uniqueId = 0;
let checkNewProfilesTimeout = null;
let processedProfiles = new Set();
let isMasterRunning = true;
let profiles = [];
let walletsToProfiles = {};
let countProfiles = profiles.length;
await getAndRefreshProfiles();

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
    setTimeout(sendQuests, 2500);
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
    setTimeout(sendQuests, 2500);
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
    this.SZNPage = null;
    this.loggedIn = 0;
    this.startQuestTime = Date.now();
  }

  setLineaPage(page, cursor) {
    this.SZNPage = page;
    if(ADD_CURSOR) addCursorToPage(page);
  }

  click(selector, log) {
    return this.clickDifferentPage(this.SZNPage, selector, log);
  }

  clickDifferentPage(page, selector, log) {
    return safeClick(page, selector, this.profile, log);
  }

  logError = (...args) => {
    if(IS_TEST) console.error(`!!!err!!!`, ...args);
    else process.stdout.write(args.join(' '));
  };

  log = (...args) => {
    const message = args.join(' '); // Преобразование всех аргументов в строку
    if(IS_TEST) {
      console.log(message);
    } else {
      process.stdout.write(message); // Добавляем перенос строки для читаемости
    }
  };

  goToSZN() {
    return this.SZNPage.goto('https://app.layer3.xyz/campaigns/linea-culture-szn', {timeout: 60e3, waitUntil: 'load'});
  }
}

async function checkAchievedQuests(profileId) {
  const quests = await getAchievedQuests(profileId);
  let filteredQuests = [];

  let lowerCaseData = {};
  for(let quest of quests) {
    lowerCaseData[quest.name.toLowerCase()] = { exp: quest.exp, bonusExp: quest.bonusExp };
  }

  let welcomeQuestsCompleted = false;
  if(lowerCaseData['welcomeszn'] !== undefined && lowerCaseData['welcomeszn'] !== '' && lowerCaseData['welcomeszn'] !== '-1') {
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

    const needsToBeDone = quest.exp === undefined || quest.exp === '' || quest.exp == -1;
    const bonusCompleted = quest.bonusExp !== undefined && quest.bonusExp !== '' && quest.bonusExp != -1;

    // if(questName === 'gamerboom') {
      // console.log('needToBeDone', needsToBeDone, 'isBonusQuest', isBonusQuest, 'bonusCompleted', bonusCompleted)
    // }
    return needsToBeDone || (isBonusQuest && !bonusCompleted);
  });

  filteredQuests = filteredQuests.concat(remainingQuests);
  if(IS_TEST) console.log('After check quests request, remained to do quests ->', filteredQuests);

  return filteredQuests.length > 0;
}

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
      path.join(path.resolve(), 'szn.js'),
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
      // console.log(`P${profile}(${profileUniqueId}) - exit`, code);
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

const runProfilesSequentially = async(profiles, log = true) => {
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

  // if(log) IS_TEST ? console.log("PROFILE FOR TEST:", PROFILE) : console.log("PROFILES FOR WORK:", profiles);
  const _profiles = profiles.splice(0, PARALLEL_PROFILES - running);
  let checkLeftProfiles = false;
  for(const profile of _profiles) {
    uniqueId++;
    const isGood = await checkAchievedQuests(profile);
    if(!isGood) {
      console.log(`P${profile}(${uniqueId}) Achieved all quests!`)
      // countProfiles--;
      processedProfiles.add(profile)
      checkLeftProfiles = true;
      continue;
    }

    puppeteerRunInWorker(profile, uniqueId);
    await delay(randomBetween(DELAY_BROWSER[0], DELAY_BROWSER[1])); // задержка между запусками
  }

  if(checkLeftProfiles) {
    return runProfilesSequentially(profiles, false);
  }

  isMasterRunning = false;
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
    if(IS_TEST) {
      console.log(`NO CLICK! NO Element:`, selector)
      console.log('NO CLICK! NO Element: elementExists', elementExists, 'isDisabled', isDisabled)
    }
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
    try {
      await page.goto('chrome-extension://pabjfbciaedomjjfelfafejkppknjleh/popup.html');
    } catch (err) {
      try {
        await page.goto('chrome-extension://ehneecejjcknninfgfmbdabpacpohgeg/popup.html');
      } catch(err) {
        await page.goto('chrome-extension://meiikfjpapeahbgippjbpkcedgkgcbco/popup.html');
      }
    }
    await page.waitForSelector('#client-key-input');

    const inputValue = await page.evaluate(() => {
      const inputElement = document.querySelector('input[id="client-key-input"]');
      return inputElement.value;
    });

    if(inputValue === '' || inputValue !== CAPTCHA_MONSTER_API_KEY) {
      if(inputValue !== '') {
        await page.click('input[id="client-key-input"]');
        await page.focus('input[id="client-key-input"]');

        await page.evaluate(() => {
          const inputElement = document.querySelector('input[id="client-key-input"]');
          inputElement.select();
        });

        await page.keyboard.press('Backspace');
        await page.waitForFunction(() => {
          const inputElement = document.querySelector('input[id="client-key-input"]');
          return inputElement.value === '';
        });
      }
      await page.type('input[id="client-key-input"]', CAPTCHA_MONSTER_API_KEY);

      await page.evaluate(() => {
        const inputElement = document.querySelector('input[id="client-key-input"]');
        const inputEvent = new Event('input', { bubbles: true });
        const changeEvent = new Event('change', { bubbles: true });
        inputElement.dispatchEvent(inputEvent);
        inputElement.dispatchEvent(changeEvent);
      });

      await delay(300);
      await page.click('#client-key-save-btn');
    }

    await page.close();
    resolve(true)
  });
}

function setExp(profileId, wallet, questName, success = true, isBonusStage = false) {
  if(questName === 'CUBEs') return;
  if(questName !== 'Introduction' && questName !== 'LineaLXP' && questName !== 'NFTLearn' && questName !== 'NFTScams') {
    if(questName === 'Snaps') questName = 'WelcomeSZN';
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
    // containerSelectors = [
    //   '.flex.h-full.w-full.max-w-quest-content .relative.flex.w-full.justify-between'
    // ];
    containerSelectors = ['.w-full.overflow-hidden.rounded-lg.bg-v2-background-primary-alt'];

    if(questExecuted.name === 'LineaPark' && multiple) {
      containerSelectors.push('.flex.h-full.w-full.max-w-quest-content'); // Добавляем этот селектор, если multiple=true
      container = 'multiple';
    }

  } else {
    containerSelectors = ['.w-full.overflow-hidden.rounded-lg.bg-v2-background-primary-alt'];
  }

  if(questExecuted.name === 'CUBEs' && noButtons) containerSelectors = ['.flex.h-full.w-full.max-w-quest-content'];
  if(IS_TEST) console.log('container', containerSelectors);

  return page.evaluate((selector) => {
    function isSimpleClass(className) {
      // Класс считается простым, если он не содержит специальных символов
      return /^[a-zA-Z0-9-_]+$/.test(className);
    }

    function getUniqueSelector(element, levels = 3) {
      if (!element) return '';
      if (element.id) return `#${CSS.escape(element.id)}`;
      let path = [];
      let currentElement = element;
      for (let i = 0; i < levels; i++) {
        if (!currentElement) break;
        let sibling = currentElement;
        let siblingIndex = 0;
        while (sibling.previousElementSibling) {
          sibling = sibling.previousElementSibling;
          siblingIndex++;
        }
        let tagName = currentElement.tagName.toLowerCase();
        let className = currentElement.className
          ? '.' +
            Array.from(currentElement.classList)
              .filter(isSimpleClass)
              .join('.')
          : '';
        let nthChild = siblingIndex > 0 ? `:nth-child(${siblingIndex + 1})` : '';
        path.unshift(`${tagName}${className}${nthChild}`);
        currentElement = currentElement.parentNode;
      }
      return path.join(' > ');
    }

    let buttons = [];
    document.querySelectorAll(selector).forEach(container => {
      container.querySelectorAll('button, p').forEach(button => {
        const buttonText = button.textContent.trim();
        let buttonSelector = getUniqueSelector(button);

        buttons.push({ text: buttonText, selector: buttonSelector });
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

    await metaMaskPage.goto(`chrome-extension://${metamaskID}/home.html#`);
    await metaMaskPage.waitForTimeout(1e3);
    if(wallet.includes('Элемент не найден')) return resolve(false);
    _profile.log(`wallet:`, wallet);

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

          //Если вдруг квест ENDED, то мог остаться только бонус, так что стадию сразу меняем
          const questEnded = await page.evaluate(() => {
            const elements = document.querySelectorAll('.fixed.inset-x-none.bottom-none.z-1.flex p');
            for(let element of elements) {
              if(element.textContent.includes('Quest ended')) {
                return true;
              }
            }

            return false;
          });

          if(questEnded) {
            clearTimeout(timeoutId);
            clearTimeout(questTimeout);

            // await page.close();
            return resolve({success: false, bonusStage: bonusStage});
          }

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

                // await page.close();
                return resolve({success: true, bonusStage: bonusStage});
              }
            }
          }

          if(buttons.length == 0 && quest !== 'CUBEs' && step > 0) {
            clearTimeout(timeoutId);
            clearTimeout(questTimeout);

            // await page.close();
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

              // await page.close();
              return resolve({success: true, bonusStage: bonusStage});
            }

            if(CUBEsRewardsClaimed) {
              _profile.log('CUBEs claimed, reload and waiting for completed status')
              await delay(8e3);
              await page.reload();
            }

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
                  } else {
                    _profile.log('No MM. sign button, try again!')
                    CUBEsRewardsClaimed = false;
                  }
                }
              }

              if(button.text === 'DeFi on Linea') {
                clearTimeout(timeoutId);
                clearTimeout(questTimeout);

                await page.close();
                return resolve({success: true, bonusStage: bonusStage});
              }
            }

            if(quest.includes('Voting')) {
              if(button.text === 'Mint CUBE to claim' && !CUBEsRewardsClaimed) {
                const verifyBtnSelector = 'button.relative.flex.w-fit.cursor-pointer.select-none.items-center.justify-center.whitespace-nowrap.font-semibold.outline-none.transition-all.bg-v2-blue-base.text-v2-content-primary.gap-xs.rounded-md.px-md.py-xs';
                await safeClick(page, verifyBtnSelector, profile);
                const signResult = await signMetaMask(_profile);
                if(signResult === true) {
                  CUBEsRewardsClaimed = true;
                  _profile.log('Minted now, going to main page and check completed status..');
                  clearTimeout(timeoutId);
                  clearTimeout(questTimeout);

                  await delay(5e3);
                  return resolve({success: true, bonusStage: false})
                }
              }
            }

            if(button.text === 'Continue' && selector.includes('bg-red-primary') || button.text === 'No matching transactions found' || /*button.text === 'Validation failed' && */button.selector.includes('p.body.line-clamp-1.flex.text-left.text-3xs.font-semibold.text-v2-red-base')) {
              clearTimeout(timeoutId);
              clearTimeout(questTimeout);

              // await page.close();
              _profile.log('!!!Red notification!!!:', button.text)
              return resolve({success: false, bonusStage: bonusStage});
            }
            if(button.text === 'Begin' && !selector.includes('[disabled]')) {
              step++;
              await safeClick(page, selector, profile);
            }

            if(button.text === 'Connect Wallet') {
              let signResult = await signMetaMask(_profile);

              // return resolve({success: false, bonusStage: bonusStage});
            }

            if(button.text === 'Connect Ethereum wallet') {
              return resolve({success: false, bonusStage: bonusStage});
            }

            if(button.text === 'Continue' && !selector.includes('[disabled]') && !selector.includes('bg-red-primary') && !buttons.some(b => b.text === 'Connect Wallet') && !buttons.some(b => b.text === 'Log in to start') && !buttons.some(b => b.text === 'Verify') && !buttons.some(b => b.text === 'Skip')) {
              step++;

              //Если вдруг квест закончен
              const completedText = await page.evaluate(() => {
                const elements = document.querySelectorAll('.heading.text-center.font-bold.tracking-tight.text-v2-content-primary');
                for(let element of elements) {
                  if(element.textContent.includes('Quest completed')) {
                    return true;
                  }
                }

                return false;
              });

              if(completedText) {
                clearTimeout(timeoutId);
                clearTimeout(questTimeout);

                // await page.close();
                return resolve({success: true, bonusStage: bonusStage});
              }

              if(LOG_SAFE_CLICKS) _profile.log('temp-continue.1', button.selector)

              if(quest.includes('Voting')) {
                const randomIndex = Math.floor(Math.random() * questsData[quest].quizBTNs.length);
                const randomBtnId = questsData[quest].quizBTNs[randomIndex];

                let found = await findElementById(page, randomBtnId);
                if(found) {
                  _profile.log('Using vote btn: #' + randomBtnId)
                  await safeClick(page, `[id="${randomBtnId}"]`, profile);
                }
              } else {
                for(const buttonId of questsData[quest].quizBTNs) {
                  let found = await findElementById(page, buttonId);
                  if(found) {
                    await safeClick(page, `[id="${buttonId}"]`, profile);
                  }
                }
              }
              if(LOG_SAFE_CLICKS) _profile.log('temp-continue.2', button.selector)

              await delay(2e3);
              await safeClick(page, selector, profile);
            }

            if(button.text === 'Skip') {
              if(questsData[quest]?.bonus && buttons.some(b => b.text.includes('BONUS'))) {
                bonusStage = true;
                // _profile.log('Bonus page & stage now');
                step++;
              } else {
                step++;
                const skipBtnSelector = 'div.relative.flex.w-full.justify-end > div.flex.items-center.gap-xs > button.relative.flex.w-fit.cursor-pointer.select-none.items-center.justify-center.whitespace-nowrap.font-semibold.outline-none.transition-all.bg-v2-button-secondary.text-content-primary.gap-xs.rounded-md.px-md.py-xs';
                // await safeClick(page, skipBtnSelector, profile, false, 1);
                // индекс был в линея парке
                await safeClick(page, skipBtnSelector, profile);
                break;
              }
            }

            if(button.text === 'Verify') {
              step++;
              if(LOG_SAFE_CLICKS) _profile.log('Verify click.2', button.selector)
              const verifyBtnSelector = 'div.relative.flex.w-full.justify-end > div.flex.items-center.gap-xs > button.relative.flex.w-fit.cursor-pointer.select-none.items-center.justify-center.whitespace-nowrap.font-semibold.outline-none.transition-all.bg-v2-blue-base.text-v2-content-primary.gap-xs.rounded-md.px-md.py-xs';
              await safeClick(page, verifyBtnSelector, profile);
            }
          }

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
    const link = document.querySelector(`a[href="${href}"]`);
    console.log('link', link)
    if (!link) return { "needToDo": false, "status": "notFound"};

    const div = link.querySelector('.rounded-xl.bg-v2-button-secondary.pl-3xs.pr-xs');
    console.log('div', div)
    if(!div) return { "needToDo": true, "status": "needToDo"}; //need to do quest

    const spans = div.getElementsByTagName('span');
    for(let i = 0; i < spans.length; i++) {
      if(spans[i].textContent.trim() === 'Completed') { //Quest ended - Quest e , mobile:hidden
        return { "needToDo": false, "status": "completed"};
      }
      if(spans[i].textContent.trim() === 'Quest e' || spans[i].textContent.trim() === 'Overdue') { //Quest ended - Quest e , mobile:hidden
        return { "needToDo": false, "status": "ended"};
      }
    }
    return { "needToDo": true, "status": "needToDo"};

    // Проверяем наличие класса bg-brand-primary у дива
    console.log('classList', div.classList)

    return div.classList.contains('.rounded-xl.bg-v2-button-secondary.pl-3xs.pr-xs');
  }, href);
}

async function prepareAndDoQuest(_profile, questName, currentTabs, TODO_QUESTS, timeoutId) {
  const page = _profile.SZNPage;
  const {profile, browser, wallet} = _profile;
  if(IS_TEST) _profile.log('prepare quest:', questName);
  let newPage;
  let timeout = 5e3;
  if(questName === 'CUBEs') timeout = 20e3;
  const questData = questsData[questName];
  let questURLreplaced;

  try {
  //   [newPage] = await Promise.all([
  //     switchToNewTab(browser, currentTabs, true, page, timeout),
  //     _profile.click(`a[href="${questsData[questName].href}"]`, true)
  //   ]);

      // await _profile.click(`a[href="${questsData[questName].href}"]`, true)
      // await page.waitForNavigation();

      questURLreplaced = (questData.href).replace('/v2/', '');
      await page.goto(`https://app.layer3.xyz/${questURLreplaced}`);
  } catch(err) {
    _profile.log('was not able to open new tab or it has opened in current');
  }

  await page.waitForSelector('.w-full.overflow-hidden.rounded-lg.bg-v2-background-primary-alt'); //grey background

  questURLreplaced = (questData.href).replace('/v2/quests/', '');
  if(!page || !page.url().endsWith(questURLreplaced)) {
    if(page) {
      _profile.log('!!!Opened wrong quest?!!!', page.url(), questURLreplaced);
      // await page.close();
    }

    if(IS_TEST) _profile.log('going back to SZN');
    // await bringPageToFront(page, newPage);
    await _profile.goToSZN();
    await delay(3e3);
    // if(questName === 'CUBEs') {
    //   console.log('Return and find what to do next!');
    //   return;
    // }
    return prepareAndDoQuest(_profile, questName, currentTabs, TODO_QUESTS, timeoutId);
  }

  // await newPage.waitForTimeout(3e3);
  let result = await doQuest(questName, page, timeoutId, _profile, TODO_QUESTS);
  if(TODO_QUESTS.has(questName)) TODO_QUESTS.delete(questName);

  if(result.success) {
    if(!sideQuests.includes(questName)) {
      if(IS_TEST) _profile.log('result.1 bonusStage', result.bonusStage)
      setExp(profile, wallet, questName, true, result.bonusStage)
    }

    _profile.log(`completed quest!`, questName);
  } else {
    result.bonusStage ? _profile.log(`!!!Failed to complete BONUS!!!`, questName) : _profile.log(`!!!Failed to complete quest!!!`, questName);

    if(!sideQuests.includes(questName) /*&& !questName.includes('Voting')*/) {
      if(IS_TEST) _profile.log('result.2 bonusStage', result.bonusStage)
      setExp(profile, wallet, questName, false, result.bonusStage)
    }
  }

  if(!sideQuests.includes(questName)) {
    // await bringPageToFront(page, newPage);
    // await page.reload();
    await _profile.goToSZN();
    await page.waitForSelector('a[href="/v2/quests/introduction-to-linea-culture-szn"]')
    await delay(DELAY_BETWEEN_QUESTS[0], DELAY_BETWEEN_QUESTS[1]);
  } else {
    //close side-quest and return to main
    // await newPage.close();
    if(result.drop) return { result: true, reCheckQuestStatus: false };
  }

  // if(result.reCheckQuestStatus) return { result: result.success, reCheckQuestStatus: true };
  return { result: true, reCheckQuestStatus: false };
  await delay(2e3);
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
    }, 2500);

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
        if (IS_TEST) {
          targets.find(target => console.log(`Ext target profile ${profileId} ->`, target.url()));
          console.log('Resolve target:', extensionTarget)
        }
        resolve(extensionTarget);
      }
    }, 1000);
  });
}

async function signMetaMask(_profile) {
  let extensionTarget = await waitForMetaMaskTarget(_profile.browser, _profile.metamaskID);

  if(extensionTarget) {
    if(IS_TEST) _profile.log(`Found metamask extension popup-window:`, extensionTarget.url());

    let pageClosed = false;
    let page = await extensionTarget.page();
    page?.once('close', () => {
      pageClosed = true;
    });

    const buttonSelector = '[data-testid="page-container-footer-next"]';
    const signButtonSelector = '[data-testid="page-container-footer-next"]:not([disabled])';
    if(IS_TEST) _profile.log('will try to sign transaction');

    while (true) {
      try {
        if (IS_TEST) _profile.log('iteration to click sign button, pageClosed', pageClosed);
        if (pageClosed) {
          break;
        }

        const handle = await page?.waitForSelector(buttonSelector, { timeout: 5000 }).catch(() => false);
        if (!handle || pageClosed) {
          if (IS_TEST) _profile.log('break2');
          break;
        }

        const signButtonHandle = await page?.waitForSelector(signButtonSelector, { timeout: 5000 }).catch(() => false);
        if (pageClosed) {
          if (IS_TEST) _profile.log('break3');
          break;
        }

        if (signButtonHandle) {
          await page?.click(signButtonSelector);
        }
      } catch (err) {
        _profile.log('iteration to click error', err);
      }
    }

    return true;
  } else {
    return false;
  }
}

async function signInLayer3(_profile, signInBtnSelector) {
  _profile.log(`Start sign in process.`);
  await _profile.click(signInBtnSelector); // Sign In button
  const xpathSelector = "//div[contains(@id, 'radix-') and contains(@id, '-content-evm')]//button[.//span[text()='MetaMask']]";
  await _profile.SZNPage.waitForXPath(xpathSelector);
  const buttons = await _profile.SZNPage.$x(xpathSelector);
  if(buttons.length > 0) {
    if(IS_TEST) _profile.log(xpathSelector)
    await buttons[0].click();
  } else {
    _profile.logError("Button with text 'MetaMask' not found.");
  }
  await _profile.SZNPage.waitForSelector('#radix-\\:r0\\: > div > div > div:nth-child(2) .text-center.text-3xs'); //Connect wallet requesting connection text modal window

  //Подключаемся к отдельному окну метамаска
  let signResult = await signMetaMask(_profile);

  if(signResult === true) {
    // Ожидание появления второго окна через 7 секунд
    await delay(7e3)
    if(IS_TEST) _profile.log(`Try to found second metamask extension popup-window:`);
    signResult = await signMetaMask(_profile);

    try {
      // await lineaSZNPage.waitForSelector('#toaster-portal > div.fixed.left-1\\/2.top-1\\/2.flex.-translate-x-1\\/2.-translate-y-1\\/2.flex-col.items-center.justify-center > div > button', {timeout: 3e3}); //Continue button on captcha page
      const selector = 'div[role="dialog"]';
      await _profile.SZNPage.waitForSelector(selector, {timeout: 3e3});
      const checkInterval = 100; // Интервал проверки в миллисекундах
      const timeout = 30000; // Максимальное время ожидания в миллисекундах

      const start = Date.now();
      let elementExists = true;

      while(elementExists && (Date.now() - start) < timeout) {
        elementExists = await page.evaluate(selector => {
          return !!document.querySelector(selector);
        }, selector);

        if(elementExists) {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
      }

      if(!elementExists) {
        _profile.log('Element has disappeared, continuing execution.');
      } else {
        _profile.logError('Element did not disappear within the timeout period.');
      }
      // interval every 5 seconds
      // await waitAndClickDisabledButton(lineaSZNPage, '#toaster-portal > div.fixed.left-1\\/2.top-1\\/2.flex.-translate-x-1\\/2.-translate-y-1\\/2.flex-col.items-center.justify-center > div > button', profile);
    } catch (error) {
      const errString = error.toString();
      if(errString.includes("TimeoutError: Waiting for selector")) {
        _profile.log('No captcha, we are lucky')
      } else {
        _profile.log(error)
      }
    }

    // await delay(randomBetween(5e3, 8e3))
    await delay(randomBetween(1e3, 2e3))
    await _profile.SZNPage.reload();
  } else {
    _profile.log(`No extension target, close browser`);
  }
}

async function puppeteerRun(profile, profileUniqueId) {
  running++;
  // await delay(2222e3)
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
      // await page.goto('https://app.layer3.xyz/', {timeout: 60e3, waitUntil: 'load'});
      // await delay(5000);
      // const cursor = page[CURSOR_SYMBOL];
      // cursor.forceToggleRandomMove(false);

      _profile.browser = browser;
      _profile.log(`Started!`);
    } catch (error) {
      _profile.logError(`Ошибка подключения, delay 20s:`, error);
      // console.log(error)
      await delay(20e3);
      return;
    }

    if(!browser) {
      return;
    }


    if(CLEAR_CACHE_FILES_AND_IMAGES) {
      let page = await browser.newPage();

      // Перейдите на страницу настроек очистки данных браузера
      await page.goto('chrome://settings/clearBrowserData');

      // Ожидайте загрузки страницы настроек
      await page.waitForSelector('settings-ui');
      await delay(1e3);

      await page.select('>>> #dropdownMenu', '4');
      await delay(1e3);

      try {
        await page.click('>>> [label="Browsing history"][checked]');
        await delay(1e3);
      } catch(e) {}
      try {
        await page.click('>>> [label="Cookies and other site data"][checked]');
        await delay(1e3);
      } catch(e) {}
      await page.click('>>> #clearBrowsingDataConfirm');

      await page.close();
    }

    // let pages = await browser.pages();
    // // let page = pages[2];
    // let page = pages[3];
    // console.log(page.url())

    // let secondExtensionTarget = await waitForMetaMaskTarget(browser, "nkbihfbeogaeaoehlefnkodbefgpgknn", _profile.profile, false);
    // _profile.log('SEC:', secondExtensionTarget)
    // if (secondExtensionTarget) {
    //   _profile.log(`Found second metamask extension popup-window:`, secondExtensionTarget.url());

    //   let secondPageClosed = false;
    //   let secondPage = await secondExtensionTarget.page();
    //   secondPage?.once('close', () => {
    //     secondPageClosed = true;
    //   });

    //   while (true) {
    //     try {
    //       if (IS_TEST) _profile.log('iteration to click sign button on second window, secondPageClosed', secondPageClosed);
    //       if (secondPageClosed) {
    //         break;
    //       }

    //       const handle = await secondPage?.waitForSelector(buttonSelector, { timeout: 5000 }).catch(() => false);
    //       if (!handle || secondPageClosed) {
    //         if (IS_TEST) _profile.log('break2');
    //         break;
    //       }

    //       const signButtonHandle = await secondPage?.waitForSelector(signButtonSelector, { timeout: 5000 }).catch(() => false);
    //       if (secondPageClosed) {
    //         if (IS_TEST) _profile.log('break3');
    //         break;
    //       }

    //       if (signButtonHandle) {
    //         _profile.log('Click MM SIGN BLUE');
    //         await secondPage?.click(signButtonSelector);
    //       }
    //     } catch (err) {
    //       _profile.log('iteration to click error on second window', err);
    //     }
    //   }
    // }

    // await delay(2222e3)

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
      // _profile.log('Check and set captchaMonster API_KEY')
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
          throw new Error("Login timeout 300s, restart");
        }
      }, 300e3);

      const restartInterval = setInterval(() => {
        if((Date.now() - _profile.startQuestTime)/* / 1000*/ > FREEZE_QUEST_RESTART_INTERVAL) {
          throw new Error(`Quest work timeout FREEZE_QUEST_RESTART_INTERVAL, restart`);
        }
        // _profile.log('StartQuestTime:', _profile.startQuestTime, 'Date-QuestTime', (Date.now() - _profile.startQuestTime));
      }, 10e3);

      let pages = await browser.pages();
      let lineaSZNPage = null;
      //let pages1 = await browser.pages();
      //let page = pages1[0];
      for(const page of pages) {
        const title = await page.title();

        // processAnyNewPage(page);

        if(title === "Linea Culture SZN - Layer3") {
          lineaSZNPage = page;
          _profile.setLineaPage(lineaSZNPage);
          await bringPageToFront(lineaSZNPage);
          await lineaSZNPage.reload();
          break;
        }
      }

      if(!lineaSZNPage) {
        _profile.log(`Open Linea Culture SZN page...`)
        lineaSZNPage = await browser.newPage();
        _profile.setLineaPage(lineaSZNPage);
        try {
          await _profile.goToSZN();
        } catch (e) {
          _profile.log(`Goto #1`, e)
        }

        const url = new URL(lineaSZNPage.url());
        const domain = url.hostname;

        const pageTitle = await lineaSZNPage.title();
        const frames = lineaSZNPage.frames().filter(frame => {
          if (pageTitle === 'Just a moment...') {
              return frame.url().includes('cloudflare') || frame.url().includes(domain)
          }
        });

        let count = 0;
        const cloudflareInterval = setInterval(async () => {
          count++;
          if(count > 2) clearInterval(cloudflareInterval)
          if(frames.length > 0) {
            // _profile.log('Got cloudflare frame')
            const elements = await lineaSZNPage.$$('iframe');
            for (const element of elements) {
                _profile.log('Manual captcha click!')
                await element.click();
            }

            try {
              for(var item of frames) {
                  try {
                    await item.click('body');
                    var active_frame = await item.childFrames()[0]
                    await active_frame.click('[type="checkbox"]');
                  } catch (err) {
                    // _profile.log(err);
                  }
              }
              clearInterval(cloudflareInterval);
            } catch (err) {
              clearInterval(cloudflareInterval);
              // _profile.log(err);
            }
          }
        }, 16e3);
      }

      if(!lineaSZNPage) {
        _profile.log('No Linea Culture SZN page')
        return;
      }

      await lineaSZNPage.waitForSelector('a[href="/v2/quests/introduction-to-linea-culture-szn"]', {timeout: 70e3})
      await lineaSZNPage.waitForSelector('.relative.grid.min-h-portrait-card'); //karta s kvestami
      await delay(1e3);
      const signInButtonSelector = '.flex.items-center.tablet\\:gap-md .bg-v2-blue-base.text-v2-content-primary';
      let signInButtonText = await logTextFromElement(lineaSZNPage, signInButtonSelector);

      if(signInButtonText === 'Connect Wallet' || signInButtonText === 'Sign in') {
        signInButtonText = null;
        const signInBtnSelector = signInButtonSelector;
        await signInLayer3(_profile, signInBtnSelector);
        await _profile.SZNPage.waitForSelector('a[href="/v2/quests/introduction-to-linea-culture-szn"]') // тут необходимо снова ждать селектор хрефа на странице когда залогинились, чтобы получить квесты. иначе не успевает обновиться дом и мы получаем нулл
      }

      //Пока временно добавил, потому что бывало не залогинило у Ромы и продолжало кайфовать по сайту
      signInButtonText = await logTextFromElement(lineaSZNPage, signInButtonSelector);
      if(signInButtonText === 'Connect Wallet' || signInButtonText === 'Sign in') {
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

        const resultQ = await checkNotCompletedQuests(lineaSZNPage, questsData[quest].href);
        if(resultQ.needToDo || isBonusQuestNotCompleted) {
          //Проверяем только указанные, если заданы квесты выполнения вручную
          if(SELECTED_QUESTS.length > 0) {
            if(quest !== 'Introduction' && quest !== 'LineaLXP' && quest !== 'NFTLearn' && quest !== 'NFTScams' && quest !== 'Snaps') {
              const SELECTED_QUESTS_lowercase = SELECTED_QUESTS.map(item => item.toLowerCase());
              const quest_lowercase = quest.toLowerCase();

              setExp(profile, wallet, quest, false);
              if(!SELECTED_QUESTS_lowercase.includes(quest_lowercase)) continue;
            }
          }

          if(IS_TEST) _profile.log(`need to do - ${quest}:`, JSON.stringify(resultQ));
          TODO_QUESTS.add(quest);
        } else {
          if(IS_TEST) _profile.log(`completed - ${quest}:`, JSON.stringify(resultQ))
          completedQuests.push(quest);

          if(resultQ.status === 'ended') {
            setExp(profile, wallet, quest, false);
          } else {
            setExp(profile, wallet, quest, true);
          }
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

      for(const quest of route) {
        const result = await prepareAndDoQuest(_profile, quest, currentTabs, TODO_QUESTS, timeoutId);

        if(result.success === false && result.reCheckQuestStatus === true) {
          while(true) {
            _profile.log('Re-check quest status in 10s:', quest);
            await delay(10e3);
            await _profile.goToSZN();
            await _profile.SZNPage.waitForSelector('a[href="/v2/quests/introduction-to-linea-culture-szn"]')

            const resultQ = await checkNotCompletedQuests(lineaSZNPage, questsData[quest].href);
            if(resultQ.needToDo || isBonusQuestNotCompleted) {
              //not completed
            } else {
              _profile.log('completed', quest)
              completedQuests.push(quest);

              if(resultQ.status === 'ended') {
                setExp(profile, wallet, quest, false);
              } else {
                setExp(profile, wallet, quest, true);
              }
              break;
            }
          }
        }
      }

      //End and close browser
      if(!IS_TEST) {
        _profile.log(`End. Browser will be closed with delay`)
        await delay(randomBetween(...DELAY_BROWSER_CLOSE));
        await browser.close();

        _profile.log(`Browser closed`)
        return true;
      } else {
        _profile.log('TEST MODE, WITHOUT CLOSING BROWSER!')
      }
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