import puppeteer from 'puppeteer-core';
import fetch from 'node-fetch';
import axios, {all} from 'axios';
import path from 'path';
import {spawn} from 'child_process';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import GhostCursor from './ghost-cursor/lib/spoof.js';
import fs from 'fs/promises';
import {
    getRandomInt,
    randomBetween,
    getWindowPosition,
    getProfilesFromFile,
    shuffleArray,
    delay,
    getRandomElementFromSet,
    detectMetaMaskVersion,
    XP_TABLE,
    getProfilesByKey
} from './utils.js';
//config

import {
    RUN_QUESTS,
    DELAY_BETWEEN_QUESTS,
    DELAY_START,
    DELAY_BROWSER,
    DELAY_BROWSER_CLOSE,
    LOGIN_METAMASK_FIRST,
    SHUFFLE_PROFILES,
    DEBUG_QUESTS_BUTTONS,
    LOG_SAFE_CLICKS,
    ADD_CURSOR,
    METAMASK_PW,
    METAMASK_PW_2,
    BROWSER,
    ADS_PORT,
    CAPTCHA_MONSTER,
    CAPTCHA_MONSTER_API_KEY,
    FREEZE_QUEST_RESTART_INTERVAL,
    API_KEY,
    CLEAR_CACHE_FILES_AND_IMAGES
} from './config.js'

const {createCursor, installMouseHelper} = GhostCursor;
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
    if (PROFILE) return;
    let defaultFileMode = true;
    let mintedFileName = null;
    let needToDoProfiles = [];

    // if(SELECTED_QUESTS.length == 1) {
    try {
        mintedFileName = `done_${SELECTED_QUESTS[0]}.txt`;

        const data = await fs.readFile(`./done/${mintedFileName}`, 'utf8');
        const mintedWallets = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if (Object.keys(walletsToProfiles).length == 0) walletsToProfiles = await getProfilesByKey(API_KEY);
        needToDoProfiles = mintedWallets.map(wallet => walletsToProfiles[wallet]).filter(id => id !== undefined);

        defaultFileMode = false;
    } catch (err) {
        defaultFileMode = true;
        // console.log(err)
    }
    // }

    try {
        if (defaultFileMode) needToDoProfiles = await getProfilesFromFile();

        const profilesToAdd = needToDoProfiles.filter(profile => !processedProfiles.has(profile));
        if (profilesToAdd.length > 0) {
            console.log('ADDED PROFILES:', profilesToAdd)
            // profiles = profiles.concat(profilesToAdd);
            profiles = Array.from(new Set([...profiles, ...profilesToAdd]));
            profilesToAdd.forEach(profile => processedProfiles.add(profile));
            countProfiles += profilesToAdd.length;
            defaultFileMode ? console.log(`New profiles added, total now: ${countProfiles} | profiles.txt`) : console.log(`New profiles added, total now: ${countProfiles} | ${mintedFileName}`);

            if (SHUFFLE_PROFILES) {
                profiles = shuffleArray(profiles);
            }
            if (LIMIT_PROFILES > 0) {
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

if (IS_TEST) console.log(argv);
if (LOGIN_METAMASK_FIRST && METAMASK_PW === '') process.exit(console.log('No metamask password in the config.js!'));
if (API_KEY === '') process.exit(console.log('NO API KEY!'));


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
    if (!page[CURSOR_SYMBOL]) {
        const cursor = page[CURSOR_SYMBOL] = createCursor(page, {
            x: getRandomInt(200, BROWSER.windowWidth - 200),
            y: getRandomInt(200, BROWSER.windowHeight - 200)
        }, true);
        cursor.forceToggleRandomMove(true);

        if (argv.showCursor) {
            await installMouseHelper(page, isPageLoaded ? false : true);
        }
    }
}

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
        if (ADD_CURSOR) addCursorToPage(page);
    }

    click(selector, log) {
        return this.clickDifferentPage(this.SZNPage, selector, log);
    }

    clickDifferentPage(page, selector, log) {
        return safeClick(page, selector, this.profile, log);
    }

    logError = (...args) => {
        if (IS_TEST) console.error(`!!!err!!!`, ...args);
        else process.stdout.write(args.join(' '));
    };

    log = (...args) => {
        const message = args.join(' '); // Преобразование всех аргументов в строку
        if (IS_TEST) {
            console.log(message);
        } else {
            process.stdout.write(message); // Добавляем перенос строки для читаемости
        }
    };

    goToDebank() {
        return this.SZNPage.goto('https://debank.com/xp', {timeout: 60e3, waitUntil: 'load'});
    }
}

const puppeteerRunInWorker = async (profile, profileUniqueId) => {
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
            path.join(path.resolve(), 'debank.js'),
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
            if (code) {
                restartAfterError();
            } else {
                resolve();
            }
        });

        await promise;
    } catch (err) {
        console.error('spawn error', err, spawnArgs);
    }
    --running;
    runProfilesSequentially(profiles);
};

const runProfilesSequentially = async (profiles, log = true) => {
    if (PROFILE) { // * slave section
        if (running) {
            return;
        }

        puppeteerRun(PROFILE, uniqueId);
        return;
    }

    // * master section
    if (!profiles.length || running >= PARALLEL_PROFILES) {
        return;
    }

    // if(log) IS_TEST ? console.log("PROFILE FOR TEST:", PROFILE) : console.log("PROFILES FOR WORK:", profiles);
    const _profiles = profiles.splice(0, PARALLEL_PROFILES - running);
    let checkLeftProfiles = false;
    for (const profile of _profiles) {
        uniqueId++;
//    const isGood = await checkAchievedQuests(profile);
//    if(!isGood) {
//      console.log(`P${profile}(${uniqueId}) Achieved all quests!`)
//      // countProfiles--;
//      processedProfiles.add(profile)
//      checkLeftProfiles = true;
//      continue;
//    }

        puppeteerRunInWorker(profile, uniqueId);
        await delay(randomBetween(DELAY_BROWSER[0], DELAY_BROWSER[1])); // задержка между запусками
    }

    if (checkLeftProfiles) {
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
    const isXPath = (selector) => {
        // Simple heuristics to determine if the string is an XPath expression
        const xpathRegex = /^(\/|\.\/|\/\/|\(\/\/)/;
        return xpathRegex.test(selector);
    };

    if (true) {
        if ((log && LOG_SAFE_CLICKS || IS_TEST && LOG_SAFE_CLICKS)) console.log(`safeClick.2`, selector)

        const cursor = page[CURSOR_SYMBOL];
        if (IS_TEST > 0) console.log('using ghost-cursor for click:', !!cursor);
        if (IS_TEST > 0) console.log('using ghost-cursor click selector:', index !== undefined ? `${selector}:nth-child(${index + 1})` : selector);
        if (cursor) {
            const targetSelector = index !== undefined ? `${selector}:nth-child(${index + 1})` : selector;
            try {
                await cursor.click(targetSelector, {
                    moveDelay: 500,
                    moveSpeed: getRandomInt(400, 700),
                    paddingPercentage: 42
                });
            } catch (e) {
                if (IS_TEST) console.log('!!!!!POPITALSYA NAJAT KOGDA KVIZ PROPAL!!!!!!', targetSelector)
            }
        } else {
            const targetSelector = index !== undefined ? `${selector}:nth-child(${index + 1})` : selector;
            await page.click(targetSelector);
        }
    } else {
        if (IS_TEST) {
            console.log(`NO CLICK! NO Element:`, selector)
            console.log('NO CLICK! NO Element: elementExists', elementExists, 'isDisabled', isDisabled)
        }
    }
}

const bringPageToFront = async (page, oldPage) => {
    if (page === oldPage) {
        return;
    }

    const oldCursor = oldPage ? oldPage[CURSOR_SYMBOL] : undefined;
    if (oldCursor) {
        oldCursor.forceToggleRandomMove(false);
    }

    await page.bringToFront();
    await page.waitForTimeout(2e3);

    const newCursor = page[CURSOR_SYMBOL];
    if (newCursor) {
        newCursor.forceToggleRandomMove(true);
    }
};

const waitForNewTab = async (browser, delay) => {
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

    if (!newTarget) {
        return;
    }

    const newPage = await newTarget.page();
    return newPage;
};

const switchToNewTab = async (browser, currentTabs, addCursor, oldPage, delay) => {
    const newPage = await waitForNewTab(browser, delay);
    if (newPage) {
        if (ADD_CURSOR & addCursor) {
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
            if (IS_TEST) console.log('Waiting for captcha...');
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
            } catch (err) {
                await page.goto('chrome-extension://meiikfjpapeahbgippjbpkcedgkgcbco/popup.html');
            }
        }
        await page.waitForSelector('#client-key-input');

        const inputValue = await page.evaluate(() => {
            const inputElement = document.querySelector('input[id="client-key-input"]');
            return inputElement.value;
        });

        if (inputValue === '' || inputValue !== CAPTCHA_MONSTER_API_KEY) {
            if (inputValue !== '') {
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
                const inputEvent = new Event('input', {bubbles: true});
                const changeEvent = new Event('change', {bubbles: true});
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

const logTextFromElementXPath = async (page, xpath) => {
    // Wait for the element to appear in the DOM
    const [element] = await page.$x(xpath);

    if (element) {
        // Extract and return the text content of the element
        const text = await page.evaluate(element => element.innerText, element);
        return text;
    } else {
        return 'Элемент не найден.';
    }
};

async function checkMetaMaskLogin(_profile) {
    const {browser, profile, metamaskID} = _profile;
    return new Promise(async (resolve) => {
        if (!LOGIN_METAMASK_FIRST) return resolve(true);
        let wallet = null;

        let pages = await browser.pages();
        let metaMaskPage = null;
        let tempPage = await browser.newPage();

        for (const page of pages) {
            const title = await page.title();
            const url = await page.url();

            if (title === "MetaMask" || url.includes('debank.com')) {
                await page.close();
                await delay(2e3);
            }
        }

        await delay(1e3);
        if (!metaMaskPage) {
            _profile.log(`Open MetaMask page...`)
            metaMaskPage = await browser.newPage();
            await metaMaskPage.goto(`chrome-extension://${metamaskID}/home.html#unlock`, {waitUntil: 'load'});
        }

        // processAnyNewPage(metaMaskPage);

        await metaMaskPage.waitForTimeout(2e3);
        if (tempPage !== null) await tempPage.close();
        const hasHomeContainerClass = await metaMaskPage.evaluate(() => {
            return !!document.querySelector('.home__container');
        });
        _profile.log(`MetaMask .2`)

        if (!hasHomeContainerClass) {
            try {
                const chosenNetwork = await logTextFromElement(metaMaskPage, '.mm-box.mm-text.mm-text--body-sm');
                if (chosenNetwork.includes('Linea')) {
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
                if (unlockButton) {
                    await _profile.clickDifferentPage(metaMaskPage, '#password');
                    // Очистить поле ввода
                    for (let i = 0; i < METAMASK_PW.length + 10; i++) {
                        await metaMaskPage.keyboard.press('Backspace'); // Нажать клавишу Backspace 20 раз
                    }

                    await metaMaskPage.type('#password', METAMASK_PW_2);
                    await metaMaskPage.waitForTimeout(1e3);
                    await _profile.clickDifferentPage(metaMaskPage, '[data-testid="unlock-submit"]');
                    await metaMaskPage.waitForTimeout(4e3);
                }
            } catch (e) {
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
            if (networkTryAgainButton) metaMaskPage.click('.popover-wrap .mm-button-primary');
            await metaMaskPage.waitForTimeout(1e3);
            await _profile.clickDifferentPage(metaMaskPage, '[data-testid="unlock-submit"]');
        });
        ;
        wallet = await logTextFromElement(metaMaskPage, '.mm-box.mm-text.mm-text--inherit.mm-box--color-primary-default .mm-box.mm-box--display-flex');

        await metaMaskPage.goto(`chrome-extension://${metamaskID}/home.html#`);
        await metaMaskPage.waitForTimeout(1e3);
        if (wallet.includes('Элемент не найден')) return resolve(false);
        _profile.log(`wallet:`, wallet);

        return resolve({isLoggedMetaMask: true, wallet: wallet});
    });
}

function escapeCSSSelector(selector) {
    return selector.replace(/([:/#\[\]\(\)])/g, '\\$1');
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
            if (IS_TEST) console.log('try to get targets here MM.1')
            const targets = await browser.targets();
            if (IS_TEST) console.log('try to get targets here MM')
            const extensionTarget = targets.find(target =>
                target.url().startsWith(extensionUrlPrefix) &&
                !target.url().includes('home.html') &&
                !target.url().includes('background.html')
            );

            if (noLoop) {
                clearInterval(intervalId);
                clearTimeout(timeoutId);
                resolve(false);
            }

            if (extensionTarget) {
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

    if (extensionTarget) {
        if (IS_TEST) _profile.log(`Found metamask extension popup-window:`, extensionTarget.url());

        let pageClosed = false;
        let page = await extensionTarget.page();
        page?.once('close', () => {
            pageClosed = true;
        });

        const buttonSelector = '[data-testid="page-container-footer-next"]';
        const signButtonSelector = '[data-testid="page-container-footer-next"]:not([disabled])';
        if (IS_TEST) _profile.log('will try to sign transaction');

        while (true) {
            try {
                if (IS_TEST) _profile.log('iteration to click sign button, pageClosed', pageClosed);
                if (pageClosed) {
                    break;
                }

                const handle = await page?.waitForSelector(buttonSelector, {timeout: 5000}).catch(() => false);
                if (!handle || pageClosed) {
                    if (IS_TEST) _profile.log('break2');
                    break;
                }

                const signButtonHandle = await page?.waitForSelector(signButtonSelector, {timeout: 5000}).catch(() => false);
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

const clickElementsBySelector = async (page, selector) => {
    // Wait for the CSS selector to appear in the DOM
    await page.waitForSelector(selector, {visible: true, timeout: 5000});

    // Get all elements matching the selector and click them
    const elements = await page.$$(selector);
    for (const element of elements) {
        await element.click();
    }

    return elements.length;
};

const clickElementsByXPath = async (page, xpath) => {
    // Wait for the XPath to appear in the DOM
    await page.waitForXPath(xpath, {visible: true, timeout: 5000});

    // Get all elements matching the XPath and click them
    const elements = await page.$x(xpath);
    for (const element of elements) {
        await element.click();
    }

    return elements.length;
};

const clickButtonBySpanText = async (page, spanText) => {
    // Construct the XPath to find the button containing the span with the specified text
    const xpath = `//button[.//span[contains(text(), "${spanText}")]]`;

    // Wait for the button to appear in the DOM
    await page.waitForXPath(xpath, {visible: true, timeout: 10000});

    // Get the button element matching the XPath
    const [button] = await page.$x(xpath);

    if (button) {
        // Click the button
        await button.click();
        return `Button with span text "${spanText}" clicked successfully.`;
    } else {
        throw new Error(`Button with span text "${spanText}" not found.`);
    }
};

const clickMetaMaskButton = async (page) => {
    const shadowHostSelector = 'rabby-kit'; // The shadow host element

    try {
        // Wait for the entire page content to be loaded
        await page.waitForTimeout(1000); // Adjust if necessary

        // Check if the shadow host element exists
        const shadowHostExists = await page.$eval(shadowHostSelector, el => !!el);
        if (!shadowHostExists) {
            throw new Error('Shadow host not found');
        }
        console.log('Shadow host found');

        // Access the shadow root
        const shadowHost = await page.$(shadowHostSelector);
        const shadowRoot = await shadowHost.evaluateHandle(el => el.shadowRoot);
        console.log('Shadow root accessed');

        // Wait for the new content inside the shadow DOM
        const shadowContentSelector = 'div.modal-content.svelte-18y99pm > div.body.svelte-veh8pn';
        await shadowRoot.evaluate((shadowRoot, selector) => {
            const container = shadowRoot.querySelector(selector);
            if (!container) {
                throw new Error('Selector not found in shadow DOM');
            }
        }, shadowContentSelector);

        // Log the content of the new section
        const newContent = await shadowRoot.evaluate((shadowRoot, selector) => {
            const container = shadowRoot.querySelector(selector);
            return container ? container.innerHTML : 'Content not found';
        }, shadowContentSelector);

        await page.waitForTimeout(5000); // Adjust if necessary
        // Find and click the MetaMask button inside the shadow DOM
        const buttonSelector = 'div.ready-wallet-container.svelte-1rpkvp7 > button';
        await shadowRoot.evaluate((shadowRoot, selector) => {
            const button = shadowRoot.querySelector(selector);
            if (button) {
                button.click();
            } else {
                throw new Error('MetaMask button not found');
            }
        }, buttonSelector);
    } catch (error) {
        console.error(`Error: ${error.message}`);

        // Log the entire page content for debugging purposes
        const content = await page.content();
        //console.log(content);
    }
};

async function signInDebank(_profile, signInBtnSelector) {
    _profile.log(`Start sign in process.`);
    await _profile.click(signInBtnSelector); // Sign In button

    await _profile.SZNPage.waitForTimeout(1000);
    const result = await clickMetaMaskButton(_profile.SZNPage);

    //Подключаемся к отдельному окну метамаска
    let signResult = await signMetaMask(_profile);

    if (signResult === true) {
        //verify
        console.log("SIGN TRUE")
        // Ожидание появления второго окна через 7 секунд
        await delay(7e3)
        if (IS_TEST) _profile.log(`Try to found second metamask extension popup-window:`);
        signResult = await signMetaMask(_profile);
        console.log("VERIFY")
        clickElementsByXPath(_profile.SZNPage, "/html/body/div[7]/div/div/div/div[1]/div/div[1]/button")
        await delay(45000)
        let extensionTarget = await waitForMetaMaskTarget(_profile.browser, _profile.metamaskID, _profile.profile);
        let signButtonSelector = '[data-testid="page-container-footer-next"]';
        if (extensionTarget) {
            let extPage = await extensionTarget.page();
            await extPage.waitForSelector(signButtonSelector) //Next button
            await _profile.clickDifferentPage(extPage, signButtonSelector) //Next button
        }
        console.log(extensionTarget)
        await delay(10000)
//
//    try {
//      // await lineaSZNPage.waitForSelector('#toaster-portal > div.fixed.left-1\\/2.top-1\\/2.flex.-translate-x-1\\/2.-translate-y-1\\/2.flex-col.items-center.justify-center > div > button', {timeout: 3e3}); //Continue button on captcha page
//      const selector = 'div[role="dialog"]';
//      await _profile.SZNPage.waitForSelector(selector, {timeout: 3e3});
//      const checkInterval = 100; // Интервал проверки в миллисекундах
//      const timeout = 30000; // Максимальное время ожидания в миллисекундах
//
//      const start = Date.now();
//      let elementExists = true;
//
//      while(elementExists && (Date.now() - start) < timeout) {
//        elementExists = await page.evaluate(selector => {
//          return !!document.querySelector(selector);
//        }, selector);
//
//        if(elementExists) {
//          await new Promise(resolve => setTimeout(resolve, checkInterval));
//        }
//      }
//
//      if(!elementExists) {
//        _profile.log('Element has disappeared, continuing execution.');
//      } else {
//        _profile.logError('Element did not disappear within the timeout period.');
//      }
//      // interval every 5 seconds
//      // await waitAndClickDisabledButton(lineaSZNPage, '#toaster-portal > div.fixed.left-1\\/2.top-1\\/2.flex.-translate-x-1\\/2.-translate-y-1\\/2.flex-col.items-center.justify-center > div > button', profile);
//    } catch (error) {
//      const errString = error.toString();
//      if(errString.includes("TimeoutError: Waiting for selector")) {
//        _profile.log('No captcha, we are lucky')
//      } else {
//        _profile.log(error)
//      }
//    }
//
//    // await delay(randomBetween(5e3, 8e3))
//    await delay(randomBetween(1e3, 2e3))
//    await _profile.SZNPage.reload();
    } else {
        _profile.log(`No extension target, close browser`);
    }
}

async function execute_quest(selected_quest, _profile) {
    if (selected_quest === 'init') {
        console.log("INIT DEBANK CLAIM")
        try {
            const closeXPath = "/html/body/div[5]/div/div/div/div[2]/img"
            await clickElementsByXPath(_profile.SZNPage, closeXPath)
        } catch (err) {
            console.log("Probably close button pressed")
            console.log(err)
        }
        try {
            const claimXPath = "/html/body/div[1]/div[1]/div[1]/div/div[4]/div[1]/button"
            await clickElementsByXPath(_profile.SZNPage, claimXPath)
        } catch (err) {
            console.log("Probably claim 1 button pressed")
            console.log(err)
        }

        try {
            const claim2XPath = "/html/body/div[9]/div/div/div/div[1]/button"
            await clickElementsByXPath(_profile.SZNPage, claim2XPath)
        } catch (err) {
            console.log("Probably claim 2 button pressed")
            console.log(err)
        }
    } else if (selected_quest === 'zro_badge') {
        console.log("ZRO BADGE")
    } else {
        console.log("ERROR")
    }
}

async function puppeteerRun(profile, profileUniqueId) {
    running++;
    // await delay(2222e3)
    const _profile = new Profile(profile);
    const promise = (async () => {
        let wsEndpointUrl, timeoutId, browser;

        const TODO_QUESTS = new Set();
        let {a, b} = getWindowPosition(y, BROWSER);
        if (!BROWSER.grid) a = 0, b = 0;
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


            _profile.browser = browser;
            _profile.log(`Started!`);
        } catch (error) {
            _profile.logError(`Ошибка подключения, delay 20s:`, error);
            // console.log(error)
            await delay(20e3);
            return;
        }

        if (!browser) {
            return;
        }


        if (CLEAR_CACHE_FILES_AND_IMAGES) {
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
            } catch (e) {
            }
            try {
                await page.click('>>> [label="Cookies and other site data"][checked]');
                await delay(1e3);
            } catch (e) {
            }
            await page.click('>>> #clearBrowsingDataConfirm');

            await page.close();
        }

        if (CAPTCHA_MONSTER) {
            const result = await setCapMonsterCloud(browser);
            if (!result) {
                _profile.log('No captchaMonster API_KEY!')
                return false;
            }
            // _profile.log('Check and set captchaMonster API_KEY')
        }

        const metamaskID = await detectMetaMaskVersion(browser);
        _profile.metamaskID = metamaskID;

        const {isLoggedMetaMask, wallet} = await checkMetaMaskLogin(_profile);
        if (!isLoggedMetaMask && LOGIN_METAMASK_FIRST) return;

        _profile.isLoggedMetaMask = true;
        _profile.wallet = wallet;

        async function start() {
            //Отправляем в нокаут, если не залогинит
            setTimeout(() => {
                if (_profile.loggedIn == 0) {
                    throw new Error("Login timeout 300s, restart");
                }
            }, 300e3);

            const restartInterval = setInterval(() => {
                if ((Date.now() - _profile.startQuestTime)/* / 1000*/ > FREEZE_QUEST_RESTART_INTERVAL) {
                    throw new Error(`Quest work timeout FREEZE_QUEST_RESTART_INTERVAL, restart`);
                }
                // _profile.log('StartQuestTime:', _profile.startQuestTime, 'Date-QuestTime', (Date.now() - _profile.startQuestTime));
            }, 10e3);

            let pages = await browser.pages();
            let lineaSZNPage = null;
            //let pages1 = await browser.pages();
            //let page = pages1[0];
            for (const page of pages) {
                const title = await page.title();
            }

            if (!lineaSZNPage) {
                _profile.log(`Open Debank Page...`)
                lineaSZNPage = await browser.newPage();
                _profile.setLineaPage(lineaSZNPage);
                try {
                    await _profile.goToDebank();
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
                    if (count > 2) clearInterval(cloudflareInterval)
                    if (frames.length > 0) {
                        // _profile.log('Got cloudflare frame')
                        const elements = await lineaSZNPage.$$('iframe');
                        for (const element of elements) {
                            _profile.log('Manual captcha click!')
                            await element.click();
                        }

                        try {
                            for (var item of frames) {
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

            if (!lineaSZNPage) {
                _profile.log('No Linea Culture SZN page')
                return;
            }

            const clickElementXPath = async (page, xpath) => {
                // Wait for the element to appear in the DOM
                const [element] = await page.$x(xpath);

                if (element) {
                    // Click the element
                    await element.click();
                    return 'Элемент успешно нажат.';
                } else {
                    return 'Элемент не найден.';
                }
            };

            let signInXpath = '//*[@id="root"]/div[1]/div[1]/div/div/div/div[1]/div/button'
            try {
                await lineaSZNPage.waitForXPath(signInXpath, {timeout: 70e3})
                const signInButtonSelector = (signInXpath);
                let signInButtonText = await logTextFromElementXPath(lineaSZNPage, signInButtonSelector);

                //const logInResult = await clickElementXPath(lineaSZNPage, signInXpath);

//      let MMXpath = 'div > div > div.modal-content.svelte-18y99pm > div.body.svelte-veh8pn > div.sidebar.svelte-veh8pn > div > div > div.ready-wallet-container.svelte-1rpkvp7 > button > span'
//      await lineaSZNPage.waitForXPath(MMXpath, {timeout: 70e3})
//      const MMButtonSelector = (MMXpath);
//      let MMButtonText = await logTextFromElementXPath(lineaSZNPage, MMButtonSelector);
//
//      const mmResult = await clickElementXPath(lineaSZNPage, signInXpath);
                console.log(signInButtonText)

                if (signInButtonText === 'Log in to Start') {
                    signInButtonText = null;
                    const signInBtnSelector = signInButtonSelector;
                    await signInDebank(_profile, signInBtnSelector);
                    //await _profile.SZNPage.waitForXPath('a[href="/v2/quests/introduction-to-linea-culture-szn"]') // тут необходимо снова ждать селектор хрефа на странице когда залогинились, чтобы получить квесты. иначе не успевает обновиться дом и мы получаем нулл
                }

                //Пока временно добавил, потому что бывало не залогинило у Ромы и продолжало кайфовать по сайту
                signInButtonText = await logTextFromElementXPath(lineaSZNPage, signInButtonSelector);
                if (signInButtonText === 'Connect Wallet') {
                    _profile.log('Not logged in!')
                    return;
                }
            } catch (err) {
                console.log("Probably logged in")
                console.log(err)
            }

            SELECTED_QUESTS.forEach(selected_quest => {
                console.log(`EXECUTE ${selected_quest}`)
                execute_quest(selected_quest, _profile)
                }
            )

            _profile.loggedIn = 1;

            //End and close browser
            if (!IS_TEST) {
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
        if (canExit) {
            process.exit(0); // 0 success
        }
        if (!canExit) {
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