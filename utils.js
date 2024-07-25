import fs from 'fs';
import path from 'path';

export const XP_TABLE = {
  'Welcome': 30,
  'SpaceFalcon': 10,
  'GamerBoom': {
    exp: 15,
    bonusExp: 25
  },
  'Nidum': 15,
  'Galactic': {
    exp: 15,
    bonusExp: 35
  },
  'Abyss': 25,
  'Snap': {
    exp: 15,
    bonusExp: 25
  },
  'Ender': 45,
  'Satoshi': 20,
  'Yooldo': 30,
  'Dmail': 25,
  'Gamic': 40,
  'AsMatch': 25,
  'BitAvatar': 25,
  'ReadOn': 25,
  'Send': 40,
  'Music': 10,
  'Yuliverse': 30,
  'Sarubol': 30,
  '2048': 15, //bonus 25
  'LuckyCat': 20, //bonus 20
  'UltiPilot': 20, //bonus 20
  'Omnizone': 40,
  'Battlemon': 40, //bonus 40
  'PlayNouns': 40, //bonus 40
  'Unfettered': 20,
  'LineaPark': {
    exp: 65,
    bonusExp: 10
  },
  'Macaw': 0,
  'Survive': 5,
  'Zace': 25,
  'Dexsport': 0,
  'FrogWar': {
    exp: 25,
    bonusExp: 40
  },
  'ACG_WORLDS': 25,
  'AlienSwap': 30,
  'Bilinear': 30,
  'SocialScan': 10,
  'Micro3': 25,
  'ArenaGames': 15,
  'Imagine': 20,
  'Q2048': 15,
  'PoHInstructions': 0,
  'TrustaEgg': 10,
  'Taskmaster': 0,
  'WelcomeSZN': 10,
  'Octomos': 20,
  'CrazyGang': 20,
  'Push': 20,
  'Wizards': 20,
  'Efrogs': 20,
  'Voting1': 5,
  'Satoshi_W2': 20,
  'Linus': 20,
  'Yooldo_W2': 20,
  'FrogWars_W2': 20,
  'ACG_W2': 20,
  'Toad': 20,
  'Voting2': 5,
  'Ascend': 20,
  'Send_W2': 20,
  'Townstory_W2': 20,
  'Danielle': 20,
  'Demmortal': 20,
  'Foxy': 20,
  'Voting3': 5,
  'Coop': 20,
  'Borja': 20,
  'Fruit': 20,
  'FruitCrux': 20
}

export const ALIASES = {
  'YODDLO': 'Yooldo',
  'SEND_TO_CEX': 'Send',
  'TOWNSTORY': 'Galactic',
  'TOWNSTORY_BONUS': 'GalacticBonus',
  'SATOSHI_UNIVERSE': 'Satoshi',
  'ALIENSWAP_LINEA': 'AlienSwap',
  'FROG_WAR': 'FrogWar',
  'FROG_WAR_BONUS': 'FrogWarBonus',
  'NOUNS': 'PlayNouns',
  'ABBYSWORLD': 'Abyss',
  'ARENA_GAMES': 'ArenaGames',
  'GAMERBOOM_BONUS': 'GamerBoomBonus',
  'SNAP_BONUS': 'SnapBonus',
  'SOCIAL_SCAN': 'SocialScan',
  'WRAPPING': 'Gamic',
  'LINEA_CULTURE_2': 'CrazyGang',
  'LINEA_CULTURE_3': 'Push',
  'LINEA_CULTURE_4': 'Wizards',
  'LINEA_CULTURE_5': 'Efrogs',
  'LINEA_CULTURE_2_1': 'Satoshi_W2',
  'LINEA_CULTURE_2_2': 'Linus',
  'LINEA_CULTURE_2_3': 'Yooldo_W2',
  'LINEA_CULTURE_2_4': 'FrogWars_W2',
  'LINEA_CULTURE_2_5': 'ACG_W2',
  'LINEA_CULTURE_2_6': 'Toad',
  'LINEA_CULTURE_3_1': 'Ascend',
  'LINEA_CULTURE_3_2': 'Send_W2',
  'LINEA_CULTURE_3_3': 'Townstory_W2',
  'LINEA_CULTURE_3_4': 'Danielle',
  'LINEA_CULTURE_3_5': 'Demmortal',
  'LINEA_CULTURE_3_6': 'Foxy',
  'LINEA_CULTURE_4_1': 'Coop',
  'LINEA_CULTURE_4_2': 'Borja',
  'LINEA_CULTURE_4_3': 'Fruit',
  'LINEA_CULTURE_4_4': 'FruitCrux'
};

export const NFTs = [
  'SARUBOL',
  'SNAP',
  'BITAVATAR',
  'SATOSHI_UNIVERSE',
  'GAMERBOOM',
  'YODDLO',
  'ASMATCH',
  'ABBYSWORLD',
  'NIDUM',
  'READON',
  'LUCKYCAT',
  'TOWNSTORY',
  'OMNIZONE',
  'BATTLEMON',
  'NOUNS',
  'SOCIAL_SCAN',
  'LAYER_3_META',
  'FROG_WAR',
  'ZACE',
  'ALIENSWAP_LINEA',
  'ACG_WORLDS',
  'BILINEAR',
  'MICRO3',
  'IMAGINE',
  'ARENA_GAMES',
  'GAMERBOOM_BONUS',
  'SNAP_BONUS',
  'NIDUM_BONUS',
  'TOWNSTORY_BONUS',
  'FROG_WAR_BONUS',
  '2048',
  'OCTOMOS',
  'LINEA_CULTURE_2',
  'LINEA_CULTURE_3',
  'LINEA_CULTURE_4',
  'LINEA_CULTURE_5',
  'LINEA_CULTURE_2_1',
  'LINEA_CULTURE_2_2',
  'LINEA_CULTURE_2_3',
  'LINEA_CULTURE_2_4',
  'LINEA_CULTURE_2_5',
  'LINEA_CULTURE_2_6',
  'LINEA_CULTURE_3_1',
  'LINEA_CULTURE_3_2',
  'LINEA_CULTURE_3_3',
  'LINEA_CULTURE_3_4',
  'LINEA_CULTURE_3_5',
  'LINEA_CULTURE_3_6',
  'LINEA_CULTURE_4_1',
  'LINEA_CULTURE_4_2',
  'LINEA_CULTURE_4_3',
  'LINEA_CULTURE_4_4'
];

export function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export function getRandomElementFromSet(set) {
  const values = Array.from(set);
  const randomValue = values[Math.floor(Math.random() * values.length)];
  return randomValue;
}

// Функция для получения позиции окна по его индексу
export function getWindowPosition(index, BROWSER) {
  const row = Math.floor(index / 3);
  const col = index % 3;

  let a = BROWSER.startX + col * BROWSER.windowWidth;
  let b = BROWSER.startY + row * BROWSER.windowHeight;
  if(b > 0) b = b + 24;

  return { a, b };
}

export function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Чтение содержимого директории

function getNewestProfilesFile() {
  return new Promise((resolve, reject) => {
    fs.readdir('./', function (err, files) {
      if (err) {
        reject('Unable to scan directory: ' + err);
        return;
      }

      const profileFiles = files.filter(file => file.startsWith('profiles'));

      if (profileFiles.length === 0) {
        reject('No profile files found.');
        return;
      }

      const fileStats = profileFiles.map(file => {
        const filePath = path.join('./', file);
        const stats = fs.statSync(filePath);
        return { name: file, mtime: stats.mtime };
      });

      const sortedFiles = fileStats.sort((a, b) => b.mtime - a.mtime);

      resolve(sortedFiles[0].name);
    });
  });
}

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function getProfilesFromFile() {
  let array = [];
  try {
    const file = await getNewestProfilesFile();
    const data = await fs.promises.readFile(`./${file}`, { encoding: 'utf-8' });
    const parts = data.split('acc_id=');

    for (let i = 1; i < parts.length; i++) {
      const match = parts[i].match(/^\d+/);
      if (match) {
        array.push(parseInt(match[0], 10));
      }
    }

    return array.reverse();
  } catch (err) {
    console.error('Error:', err);
    return [];
  }
}

export async function detectMetaMaskVersion(browser) {
  return new Promise(async (resolve) => {
    const browserContexts = browser.browserContexts();
    for(const context of browserContexts) {
      const targets = await context.targets();
      const extensions = targets.filter(target => target.type() === 'background_page');

      for(const extension of extensions) {
        let extensionUrl = extension.url();
        const extensionId = extensionUrl.match(/chrome-extension:\/\/([^\/]+)/)[1];
        const page = await browser.newPage();
        await page.goto('chrome-extension://' + extensionId + '/manifest.json');

        const manifest = await page.evaluate(() => {
          return JSON.parse(document.body.textContent);
        });

        if(manifest.browser_action.default_title === 'MetaMask') {
          await page.close();
          await delay(2e3); // если нет делея, то почему-то вылетает после выполнения этой функции когда начинает что-то делать пупитер с такой ошибкой Connection.js:422
                //return Promise.reject(new TargetCloseError(`Protocol error (${method}): Session closed. Most likely the ${__classPrivateFieldGet(this, _CDPSessionImpl_targetType, "f")} has been closed.`));
                //TargetCloseError: Protocol error (Runtime.callFunctionOn): Session closed. Most likely the page has been closed.
          resolve(extensionId);
        } else {
          await page.close();
        }
      }
    }
  });
}

export async function getProfilesByKey(apiKey) {
  try {
    const res = await fetch(`https://smarthand.pro/php-scripts/linea.php?getProfiles=${apiKey}`, {
      method: 'GET',
    });

    return await res.json();
  } catch(err) {
    return [];
  }
}
