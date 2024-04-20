import puppeteer from 'puppeteer-core';
import fetch from 'node-fetch';
import axios from 'axios';
import { readFileSync } from 'fs';
import { detectMetaMaskVersion, delay, getNewestProfilesFile} from './poh_utils.js';
import { API_KEY, METAMASK_PW, METAMASK_PW_2 } from './config.js'

const DETECT_METAMASK_VERSION = false; //нужно ставить только если расширение старое. будет забирать время на регитсрацию
const SWITCH_LANGUAGE = true;
let metamaskID = 'nkbihfbeogaeaoehlefnkodbefgpgknn';

const logTextFromElement = async (page, selector) => {
  try {
    const text = await page.evaluate(selector => {
      const element = document.querySelector(selector);
      if (element) {
        return element.innerText; 
      } else {
        return 'Элемент не найден.';
      }
    }, selector);
  
    return text;
  } catch(err) {
    return '';
  }
};

let _x = 0;

function getProfilesFromFile(file) {
  try {
    if(!file) {
      file = getNewestProfilesFile();
    }

    const data = readFileSync(`./${file}`, { encoding: 'utf-8' });
    const lines = data.split('\n').filter(Boolean).map((line) => {
      const [id, email, password, reservedEmail] = line.split(':');
      return { id: +id, email, password, reservedEmail };
    });

    return lines.reverse();
  } catch (err) {
    console.error('Error:', err);
    return [];
  }
}

async function getPohCompletedProfiles() {
  try {
    const res = await fetch(`https://smarthand.pro/php-scripts/linea.php?getPohCompletedProfiles`, {
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

let profiles = getProfilesFromFile('poh.txt');
const didProfiles = await getPohCompletedProfiles();
const limit = +process.argv[2] || 0;

profiles = profiles.filter(profile => !didProfiles.includes(profile.id));
profiles = profiles.reverse(); //roma

if(limit) {
  profiles = profiles.slice(0, limit);
}

console.log('Profiles to do:', profiles.length);

const run = async(x = _x++, profile = profiles[x]) => {
  const result = await go(profile);
  // if(!result) {
  //   return run(x); //vremenno
  // }

  if(_x < profiles.length) {
    run();
  }
};

for(let i = 0; i < Math.min(profiles.length, 6); ++i) {
  setTimeout(() => {
    run();
  }, i * 5e3);
}

async function go(profile) {
  const {email, password, reservedEmail, id} = profile;
  console.log('Profile:', id, 'Email:', email);
  let wsEndpointUrl;
  await axios.get(`http://local.adspower.com:50325/api/v1/browser/start?serial_number=${id}&ip_tab=0&launch_args=["--window-size=1920,1080"]`).then(response => {
    if(response.data) {
      if(!response.data.data) {
        console.log('Ws puppeteer error!');
        return;
      }
      wsEndpointUrl = response.data.data.ws.puppeteer;
      console.log(wsEndpointUrl)
    }
  }).catch(error => {
    console.error('Error:', error);
  });

  let browser;

  try {
    //const wsEndpointUrl = `ws://127.0.0.1:9222/devtools/browser/30d09e6f-8c56-4d70-ab63-c56cf47b68c2`;
    browser = await puppeteer.connect({
      browserWSEndpoint: wsEndpointUrl,
      defaultViewport: null,
      ignoreHTTPSErrors: true,
      timeout: 15000,
    });
    // Дальнейшие действия с браузером

    console.log('Ws puppeteer connected!')
  } catch (error) {
    console.error('Ошибка подключения:', error);
    return;
  }

  async function start() {
    if(DETECT_METAMASK_VERSION) {
      metamaskID = await detectMetaMaskVersion(browser)
      await delay(1e3)
    }
    // Get the page. This assumes that there is only one page in the Pages array.
    //const page = (await browser.pages())[0];

    await delay(5000);

    let pages;
    let metaMaskPage;
    let tempPage;
    try {
      pages = await browser.pages();
      metaMaskPage = null;
      tempPage = await browser.newPage();
    } catch (err) {
      console.log('Catch eror .1:', err)
      return;
    }

    // await delay(1000);

    for (const page of pages) {
      const title = await page.title();

      if (title === "MetaMask") {
        await page.close();
        await delay(2e3)
        //break;
      }
    }

    if(!metaMaskPage) {
      console.log("Open MetaMask page...")
      metaMaskPage = await browser.newPage();
      await metaMaskPage.goto(`chrome-extension://${metamaskID}/home.html#unlock`, {waitUntil: 'load'});
    }

    const updatedPages = await browser.pages();

    for(const page of updatedPages) {
      const title = await page.title();

      if(title !== 'MetaMask') {
        continue;
      }
      //const htmlContent = await page.content();
      //console.log(htmlContent);

      try {
        await metaMaskPage.waitForTimeout(2e3);
        if(tempPage !== null) await tempPage.close();
        const hasHomeContainerClass = await metaMaskPage.evaluate(() => {
          return !!document.querySelector('.home__container');
        });
        console.log(`MetaMask .2`)

        if(!hasHomeContainerClass) {
          try {
            const chosenNetwork = await logTextFromElement(metaMaskPage, '.mm-box.mm-text.mm-text--body-sm');
            if(chosenNetwork.includes('Linea')) {
              //Switch network to ETH
              await metaMaskPage.click('[data-testid="network-display"]')
              await metaMaskPage.waitForSelector('.mm-box.characters');
              await metaMaskPage.click('.mm-box.multichain-network-list-menu > div > div:nth-child(1) > div');
            }

            delay(10e3)
            await metaMaskPage.type('#password', METAMASK_PW);
            await metaMaskPage.waitForTimeout(1e3);
            await metaMaskPage.click('[data-testid="unlock-submit"]');
            await metaMaskPage.waitForTimeout(4e3);

            const unlockButton = await metaMaskPage.evaluate(() => {
              return !!document.querySelector('[data-testid="unlock-submit"]');
            });
            if(unlockButton) {
              await metaMaskPage.click('#password');
              // Очистить поле ввода
              for(let i = 0; i < METAMASK_PW.length + 10; i++) {
                  await metaMaskPage.keyboard.press('Backspace'); // Нажать клавишу Backspace 20 раз
              }

              await metaMaskPage.type('#password', METAMASK_PW_2);
              await metaMaskPage.waitForTimeout(1e3);
              await metaMaskPage.click('[data-testid="unlock-submit"]');
              await metaMaskPage.waitForTimeout(4e3);
            }
          } catch(e) {
            console.log(e)
            console.log(`NO METAMASK!`);
            browser.close();

            process.exit(0);
            // return endTask(profile, browser, page, true);
            // return resolve(false);
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
        await metaMaskPage.click('[data-testid="network-display"]');
        await metaMaskPage.waitForSelector('.mm-box.characters');
        await metaMaskPage.click('.mm-box.multichain-network-list-menu > div > div:nth-child(2) > div');
        //Get Wallet
        await metaMaskPage.waitForSelector('.mm-box.multichain-app-header__contents button.mm-button-icon--size-sm');
        await metaMaskPage.click('.mm-box.multichain-app-header__contents button.mm-button-icon--size-sm');
        await metaMaskPage.waitForSelector('[data-testid="account-list-menu-details"]');
        await metaMaskPage.click('[data-testid="account-list-menu-details"]');
        //& fix network freeze
        await metaMaskPage.waitForSelector('.mm-box.mm-text.mm-text--inherit.mm-box--color-primary-default .mm-box.mm-box--display-flex').catch(async (e) => {
          const networkTryAgainButton = await metaMaskPage.evaluate(() => {
            return !!document.querySelector('.popover-wrap .mm-button-primary');
          });
          if(networkTryAgainButton) metaMaskPage.click('.popover-wrap .mm-button-primary');
          await metaMaskPage.waitForTimeout(1e3);
          await metaMaskPage.click('[data-testid="unlock-submit"]');
        });;
        let wallet = await logTextFromElement(metaMaskPage, '.mm-box.mm-text.mm-text--inherit.mm-box--color-primary-default .mm-box.mm-box--display-flex');
        console.log(`wallet:`, wallet);

        let openidPage = await browser.newPage();
        await openidPage.goto('https://auth.openid3.network/', {waitUntil: 'networkidle0'});

        const signInButton = await openidPage.evaluate(() => {
          return !!document.querySelector('[data-testid="rk-connect-button"]');
        });

        //OpenID Auth
        if(signInButton) {
          await openidPage.click('[data-testid="rk-connect-button"]');
          await openidPage.waitForSelector('[data-testid="rk-wallet-option-metaMask"]');
          await openidPage.waitForTimeout(1e3);
          await openidPage.click('[data-testid="rk-wallet-option-metaMask"]');

          let extensionTarget = await waitForMetaMaskTarget(browser, metamaskID, id)

          if(extensionTarget) {
            // console.log(`Found metamask extension popup-window:`, extensionTarget.url());
            let popupPage = await extensionTarget.page();
            let signButtonSelector = '[data-testid="page-container-footer-next"]';
            await popupPage.waitForSelector(signButtonSelector) //Next button
            await popupPage.click(signButtonSelector) //Next button

            extensionTarget = await waitForMetaMaskTarget(browser, metamaskID, id);
            popupPage = await extensionTarget.page();

            if(extensionTarget) {
              await popupPage.waitForSelector(signButtonSelector) //Next button
              await popupPage.click(signButtonSelector) //Next button
            }
          }

          await delay(2e3);
          await openidPage.reload();
        }
        const [newTarget] = await Promise.all([
          browser.waitForTarget(target => target.opener() === openidPage.target()),
          openidPage.click('.w-full.border .p-2.rounded.justify-center')
        ]);

        const newPageGoogle = await newTarget.page();

        //Google auth
        let account = false;
        //No accounts in google
        let url = newPageGoogle.url();
        // console.log('google popup url:', url)
        if(url.includes("signin/identifier")) {
        } else {
          //One or more accounts
          console.log("You already have a google accounts, check please.")
          account = true;
        }
        // if(url.includes("auth/oauthchooseaccount")) {
        // }

        await newPageGoogle.waitForNavigation().catch((error) => {
          console.log('Navigation .1 error', error);
        });

        const openidData = {
          "poh": "openid",
          "email": profile.email,
          "password": profile.password,
          "reservedEmail": profile.reservedEmail,
          "profile": profile.id,
          "wallet": wallet
        }

        console.log('lang.1')

        if(SWITCH_LANGUAGE) {
          try {
            console.log('lang.2')
            await delay(2e3)
            // if(promise)
            // await newPageGoogle.waitForSelector('[data-value="en-US"]');
            console.log('lang.3')
            await newPageGoogle.evaluate(() => {
              document.querySelector('[data-value="en-US"]').click();
            })
            await newPageGoogle.waitForNavigation().catch((error) => {
              console.log('Navigation .1.1 error', error);
            });
            await delay(1e3);
          } catch(err) {
            console.log('cant change language');
          }
        }

        if(!account) {
          await newPageGoogle.waitForSelector('#identifierId');
          await newPageGoogle.type('#identifierId', email);
          await delay(1e3);

          let nextButtonXPath = "//button[.//span[contains(text(),'Next')]]";
          let nextButtons = await newPageGoogle.$x(nextButtonXPath);

          if(nextButtons.length > 0) {
              await nextButtons[0].click();
          } else {
              console.log('Btn Next.1 not found.');
          }

          await newPageGoogle.waitForSelector('#headingText'); //next page after login

          const isCaptcha = await openidPage.evaluate(() => {
            return !!document.querySelector('.recaptcha-checkbox.goog-inline-block');
          });

          console.log('3')
          if(isCaptcha) {
            await checkRecaptcha();
          }
          console.log('4')

          nextButtonXPath = "//button[.//span[contains(text(),'Next')]]";
          nextButtons = await newPageGoogle.$x(nextButtonXPath);

          if(nextButtons.length > 0) {
              await nextButtons[0].click();
          } else {
              console.log('Btn Next.2 not found.');
          }

          await newPageGoogle.waitForNavigation({waitUntil: 'networkidle0'}).catch((error) => {
            console.log('Navigation .2 error', error);
          });;
          await newPageGoogle.waitForSelector('input[type="password"]')

          const waitForPassword = async () => {
            return new Promise(async (resolve) => {
              setTimeout(async() => {
                await newPageGoogle.type('input[type="password"]', password);
                nextButtonXPath = "//button[.//span[contains(text(),'Next')]]";
                nextButtons = await newPageGoogle.$x(nextButtonXPath);
                if(nextButtons.length > 0) {
                  await nextButtons[0].click();
                  resolve(true);
                } else {
                  console.log('Btn Next.3 not found.');
                  resolve(false);
                }
              }, 5e3);
            });
          }

          await waitForPassword().then(async result => {
            if(result) {
              await newPageGoogle.waitForNavigation({waitUntil: 'networkidle0'}).catch((error) => {
                console.log('Navigation .3 error', error);
              });;
              let nextStep = await waitForGoogleHTMLHeader(newPageGoogle, browser, true);
              if(nextStep.success && nextStep.step === 'Verify') {
                console.log('Confirm 1')
                try {
                  console.log('Confirm 2')
                  const textToFind = "Confirm your recovery email";
                  const xpath = `//div[contains(text(), '${textToFind}')]`;

                  await newPageGoogle.waitForXPath(xpath, { visible: true }); // Ожидание элемента

                  console.log('Confirm 3')
                  const elements = await newPageGoogle.$x(xpath);
                  if(elements.length > 0) {
                    await elements[0].click(); // Нажимаем на первый найденный элемент
                    console.log('Recovery email clicked')
                    await newPageGoogle.waitForNavigation({waitUntil: 'networkidle0'}).catch((error) => {
                      console.log('Navigation .4 error', error);
                    });;
                    await newPageGoogle.waitForSelector('input[id="knowledge-preregistered-email-response"]')

                    const waitForReservedEmailInput = async () => {
                      return new Promise(async (resolve) => {
                        setTimeout(async() => {
                          await newPageGoogle.type('input[id="knowledge-preregistered-email-response"]', reservedEmail);
                          nextButtonXPath = "//button[.//span[contains(text(),'Next')]]";
                          nextButtons = await newPageGoogle.$x(nextButtonXPath);
                          if(nextButtons.length > 0) {
                            await nextButtons[0].click();
                            console.log('Confirm email next btn clicked')
                            await delay(2e3);

                            resolve(true);
                          } else {
                            console.log('Btn Next.4 not found.');
                            resolve(false);
                          }
                        }, 5e3);
                      });
                    }

                    await waitForReservedEmailInput();
                  } else {
                    console.log('Element not found');
                  }
                } catch (error) {
                  console.error('Found or click error:', error);
                }
              }

              nextStep = await waitForGoogleHTMLHeader(newPageGoogle, browser);
              console.log('nextStep', nextStep)
              if(nextStep.success && nextStep.step === 'SignIn') {
                nextButtonXPath = "//button[.//span[contains(text(),'Continue')]]";
                nextButtons = await newPageGoogle.$x(nextButtonXPath);
                if(nextButtons.length > 0) {
                  await nextButtons[0].click();
                  console.log('Google logged in')

                  const submitButton = await waitForElementByInnerText(openidPage, '.mr-2.h-12.rounded-full', 'Submit');
                  if(submitButton) {
                    await claimAttestationLoop(openidPage, browser, id, openidData);
                  } else {
                    console.log('Interval tries 30+ exceeded.')
                    return endTask(profile, browser, page, false);
                  }
                } else {
                  console.log('Btn continue not found.1');
                  return endTask(profile, browser, page, false);
                }
              }
            } else {
              console.log('Failed in :(');
            }
          })
        } else {
          //Сюда попадаем если аккаунт уже вошел какой-нибудь
          await newPageGoogle.waitForSelector('#headingText');
          await delay(2e3);

          const xpath = `//div[@data-email="${email}"]`;
          const elements = await newPageGoogle.$x(xpath);

          if(elements.length > 0) {
              await elements[0].click();

              await newPageGoogle.waitForNavigation({waitUntil: "networkidle0"}).catch((error) => {
                console.log('Navigation .5 error', error);
              });

              const promise = await new Promise((resolve) => {
                const langInterval = setInterval(async() => {;
                console.log('lang.3')
                  const selector = '[data-value="en-US"]';
                  const languageBtn = await newPageGoogle.evaluate((selector) => {
                    let wtf = !!document.querySelector('[data-value="en-US"]');
                    if(wtf) {
                      document.querySelector('[data-value="en-US"]').click();
                    }
                    return wtf;
                  }, selector)
                  if(languageBtn) {
                    clearInterval(langInterval);
                    resolve(true);
                  }
                }, 1e3)
              });
              let nextStep = await waitForGoogleHTMLHeader(newPageGoogle, browser);
              console.log('nextStep', nextStep)
              if(nextStep.success && nextStep.step === 'SignIn') {
                let nextButtonXPath = "//button[.//span[contains(text(),'Continue')]]";
                let nextButtons = await newPageGoogle.$x(nextButtonXPath);
                if(nextButtons.length > 0) {
                  await nextButtons[0].click();
                  console.log('Google logged in')

                  const submitButton = await waitForElementByInnerText(openidPage, '.mr-2.h-12.rounded-full', 'Submit');
                  if(submitButton) {
                    await claimAttestationLoop(openidPage, browser, id, openidData);
                  } else {
                    console.log('Interval tries 30+ exceeded.')
                    return endTask(profile, browser, page, false);
                  }
                } else {
                  console.log('Btn continue not found.1');
                  return endTask(profile, browser, page, false);
                }
              }
          } else {
            console.log('No div box with email', email);
            return endTask(profile, browser, page, false);
          }
        }

        // return endTask(profile, browser, page, false);
      } catch (error) {
        console.log('Error', error)
        console.log('Restart browser and do again the same wallet key and browser ID!')

        return endTask(profile, browser, page, false);
      }
    }
  }

  return start();
}

async function endTask(profile, browser, page, successful = false) {
  return new Promise(async(resolve) => {
    if(successful) {
      await page.close();
      
      setTimeout(() => {
        browser.close();
      }, 3e3);
      return resolve(true);
    } else {
      console.log('closing browser');
      await browser.close();
      await delay(3e3);

      return resolve(false);
    }
  });
}

async function waitForMetaMaskTarget(browser, extensionID, profileId, noLoop = false) {
  const extensionUrlPrefix = getMetaMaskExtensionUrlPrefix(extensionID);

  return new Promise((resolve, reject) => {
    let timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      resolve(false);
    }, 15e3);

    const intervalId = setInterval(async () => {
      const targets = await browser.targets();
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
        // targets.find(target => console.log(`Ext target ->`, target.url()));
        resolve(extensionTarget);
      }
    }, 1000);
  });
}

function getMetaMaskExtensionUrlPrefix(extensionID) {
  return `chrome-extension://${extensionID}`;
}

async function checkRecaptcha() {
  return new Promise((resolve) => {
    const checkRecaptcha = async () => {
      const isChecked = await newPageGoogle.evaluate(() => {
        const recaptcha = document.querySelector('.recaptcha-checkbox.goog-inline-block.recaptcha-checkbox-unchecked');
        return recaptcha && recaptcha.getAttribute('aria-checked') === 'true';
      });
    
      if(isChecked) {
        console.log('reCAPTCHA solved.');
        clearInterval(checkInterval);
        return resolve(true);
      } else {
        console.log('reCAPTCHA isn\'t solved.');
      }
    };
  
    const checkInterval = setInterval(checkRecaptcha, 1e3);
  });
}

async function waitForGoogleHTMLHeader(page, browser, withDestroy = false) {
  return new Promise((resolve) => {
    let attempts = 0;

    const checkHeader = async () => {
      const headerText = await logTextFromElement(page, '#headingText');
      attempts++;
      
      if(headerText.includes('Sign in to')) {
        console.log('Sign in header found');
        clearInterval(checkInterval);
        resolve({success: true, step: 'SignIn'});
      }
      if(headerText.includes('Verify it')) {
        console.log('Verify it\'s you found');
        clearInterval(checkInterval);
        resolve({success: true, step: 'Verify'});
      }
      if(headerText.includes('Verify it')) {
        console.log('Choose an account');
        clearInterval(checkInterval);
        resolve({success: true, step: 'Choose an account'});
      }
      if(headerText.includes('Something went')) {
        let nextButtonXPath = "//button[.//span[contains(text(),'Next')]]";
        let nextButtons = await newPageGoogle.$x(nextButtonXPath);
        if(nextButtons.length > 0) {
          await nextButtons[0].click();
          console.log('Something went wrong, try to click next!')
        }
      }
      // if(headerText.includes('Something went wrong')) {
      //   clearInterval(checkInterval);
      //   resolve({success: false, step: '-'}); // Разрешение промиса с success: false
      // }
      if(attempts >= 15 && withDestroy) {
        clearInterval(checkInterval);
        console.log('Too many attempts restart task && browser.')

        return endTask(false, browser, page, false);
      }

      if(attempts >= 2 && withDestroy) {
        clearInterval(checkInterval);
        resolve({success: false, step: '-'}); // Разрешение промиса с success: false
      }
        
      console.log('No sign in or verify header!');
    };
  
    const checkInterval = setInterval(checkHeader, 2e3);
  });
}

async function waitForElementByInnerText(page, selector, textToFindInElement) {
  return new Promise((resolve) => {
    let tries = 0;
    const checkHeader = async () => {
      const elementText = await logTextFromElement(page, selector);
      tries++;

      if(tries >= 30) return resolve(false);
      
      if(elementText.includes(textToFindInElement)) {
        console.log(`${textToFindInElement} found`);

        clearInterval(checkInterval);
        return resolve(true);
      } else {
        // console.log(`${textToFindInElement} not found`);
      }
    };
  
    const checkInterval = setInterval(checkHeader, 2e3);
  });
}

async function isMetaMaskPopupClosed(browser, extensionID) {
  const extensionUrlPrefix = getMetaMaskExtensionUrlPrefix(extensionID);
  const targets = await browser.targets();
  // targets.find(target => console.log(`Ext after click target ->`, target.url()));
  const extensionTarget = targets.find(target =>
    target.url().startsWith(extensionUrlPrefix) &&
    (target.url().includes('notification.html') || target.url().includes('confirm-transaction.html'))
  );
  return !extensionTarget; // Возвращает true, если окно MetaMask закрыто
}

async function claimAttestationLoop(page, browser, profile, openidData) {
  const claimLoop = setTimeout(async () => {
    await page.click('.mr-2.h-12.rounded-full', 'Submit');
    let extensionTarget2 = await waitForMetaMaskTarget(browser, metamaskID, profile)
    
    if(extensionTarget2) {
      // console.log(`Found metamask extension popup-window:`, extensionTarget.url());
      let popupPage = await extensionTarget2.page();
      let signButtonSelector = '[data-testid="page-container-footer-next"]';
      await popupPage.waitForSelector(signButtonSelector) //Sign btn
      console.log('MM click sign.')
      await popupPage.click(signButtonSelector) //Sign btn

      const confirm = setInterval(async () => {
        let isClosed = await isMetaMaskPopupClosed(browser, metamaskID);
        console.log('isClosed metamask', isClosed)

        if(!isClosed) {
          let extensionTarget3 = await waitForMetaMaskTarget(browser, metamaskID, profile)
          
          if(extensionTarget3) {
            try {
              popupPage = await extensionTarget3.page();
              let signButtonSelector = '[data-testid="page-container-footer-next"]';
              await popupPage.waitForSelector(signButtonSelector) //Sign btn
              console.log('MM click sign.')
              await popupPage.click(signButtonSelector) //Sign btn
            } catch(e) {
              console.log('Sign button was clicked, but metamask page has closed?? OR NOT!??')
            }
          }
        } else {
          clearInterval(confirm);
  
          console.log('OpenID: Attestation successfuly!')
          
          fetch('https://smarthand.pro/php-scripts/linea.php', {
            method: 'POST',
            body: JSON.stringify(openidData),
            headers: {
              'Content-Type': 'application/json',
              'api-key': API_KEY
            }
          })
          .then(async res => {
            const result = await res.text();
            // console.log('res', result)
            if(result) console.log('Wallet and profile saved', openidData.wallet);
          })
          .catch((e) => {
            console.log('Profile', profile, 'ERROR!', e)
          })

          setTimeout(() => {
            return endTask(profile, browser, page, true, openidData);
          }, 5e3);
        }
      }, 3e3);
    } else {
      // claimLoop();
    }
  }, 4e3);
}