import fs from 'fs';
import path from 'path';

const filePath = './quests.csv'
const XP_TABLE = {
  'Welcome': 30,
  'SpaceFalcon': 10,
  'GamerBoom': 15,
  'Nidum': 15,
  'Galactic': 15,
  'Abyss': 25,
  'Snap': 15,
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
  'Batlemon': 40, //bonus 40
  'PlayNouns': 40, //bonus 40
  'Unfettered': 20 //bonus 20
}

export function writeToCSV(profileId, wallet, questName, setXP = null, totalXP) {
  let fileContent = '';
  if(!totalXP) totalXP = 0;
  if (fs.existsSync(filePath)) {
    fileContent = fs.readFileSync(filePath, 'utf8');
  } else {
    // Если файл не существует, добавляем заголовок
    fileContent = `ID;Wallet;Total XP;Welcome;SpaceFalcon;GamerBoom;Nidum;Galactic;Abyss;Snap;Ender;Satoshi;Yooldo;Dmail;Gamic;AsMatch;BitAvatar;ReadOn;Send;Music;Yuliverse;Sarubol;2048;LuckyCat;UltiPilot;Omnizone;Battlemon;PlayNouns;Unfettered\n`;
  }

  const lines = fileContent.split('\n');
  let found = false;

  // Находим индекс столбца, который нужно обновить
  const header = lines[0].split(';');
  const walletIndex = header.indexOf('Wallet');

  // Проверяем, есть ли уже строка с данным кошельком
  for(let i = 1; i < lines.length; i++) {
    const line = lines[i].split(';');
    if(line[walletIndex] === wallet) {
      // Если строка с кошельком найдена, обновляем значение в соответствующем столбце
      const idIndex = header.indexOf('ID');
      if(idIndex !== -1) {
        line[idIndex] = profileId;
      }
      const columnIndex = header.indexOf(questName);
      if(columnIndex !== -1) {
        setXP === null ? line[columnIndex] = XP_TABLE[questName] : line[columnIndex] = setXP;
      }
      const totalXPIndex = header.indexOf('Total XP');
      if(totalXPIndex !== -1) {
        line[totalXPIndex] = totalXP;
      }
      lines[i] = line.join(';');
      found = true;
      break;
    }
  }

  // Если строка с данным кошельком не найдена, добавляем новую строку
  if(!found) {
    const newData = new Array(header.length).fill('');
    newData[header.indexOf('ID')] = profileId;
    newData[walletIndex] = wallet;
    const columnIndex = header.indexOf(questName);
    if(columnIndex !== -1) {
      setXP === null ? newData[columnIndex] = XP_TABLE[questName] : newData[columnIndex] = setXP;
    }
    const totalXPIndex = header.indexOf('Total XP');
    if(totalXPIndex !== -1) {
      newData[totalXPIndex] = totalXP;
    }
    lines.push(newData.join(';'));
  }

  // Записываем изменения в файл
  fs.writeFileSync(filePath, lines.join('\n'));
};

export function readFromCSV(profileId) {
  let fileContent = '';
  if (fs.existsSync(filePath)) {
    fileContent = fs.readFileSync(filePath, 'utf8');
  } else {
    return 'File not found';
  }

  const lines = fileContent.split('\n');
  const header = lines[0].split(';');
  const profileIdIndex = header.indexOf('ID');

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].split(';');
    if (line[profileIdIndex] === profileId) {
      const result = {};
      for (let j = 0; j < header.length; j++) {
        result[header[j]] = line[j];
      }
      return result;
    }
  }

  return 'Profile not found';
}


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

export function getNewestProfilesFile() {
  const files = fs.readdirSync('./');

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

  return sortedFiles[0].name;
}

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


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
// // Создание виртуального курсора и функции для его перемещения
// await page.evaluate(() => {
//     const cursor = document.createElement('div');
//     cursor.id = 'virtual-cursor';
//     cursor.style.width = '16px';
//     cursor.style.height = '16px';
//     cursor.style.borderRadius = '10px';
//     cursor.style.backgroundColor = 'red';
//     cursor.style.position = 'absolute';
//     cursor.style.zIndex = '10000';
//     cursor.style.pointerEvents = 'none'; // Чтобы курсор не блокировал клики
//     document.body.appendChild(cursor);

//     window.moveVirtualCursor = (x, y) => {
//         cursor.style.left = `${x}px`;
//         cursor.style.top = `${y}px`;
//     };
// });

// // Обновленная функция для плавного перемещения курсора с визуализацией
// const moveCursor = async (page, stepsRange = { min: 24, max: 38 }, movements = 8) => {
//     const rect = await page.evaluate(() => {
//         return {
//             width: document.documentElement.clientWidth,
//             height: document.documentElement.clientHeight,
//         };
//     });

//     let currentX = randomBetween(100, rect.width);
//     let currentY = randomBetween(131, rect.height);

//     for (let i = 0; i < movements; i++) {
//         const x = randomBetween(0, rect.width);
//         const y = randomBetween(0, rect.height);
//         const steps = randomBetween(stepsRange.min, stepsRange.max);
//         const delayBetweenMovements = randomBetween(100, 2650); // Задержка от 100 мс до 5 сек

//         for (let step = 1; step <= steps; step++) {
//             const stepX = (x - currentX) * step / steps + currentX;
//             const stepY = (y - currentY) * step / steps + currentY;

//             // Обновление виртуального и "реального" курсоров
//             await page.mouse.move(stepX, stepY);
//             await page.evaluate((x, y) => {
//                 window.moveVirtualCursor(x, y);
//             }, stepX, stepY);
//             await new Promise(r => setTimeout(r, 1)); // Небольшая задержка для плавности

//             if (step === steps) {
//                 currentX = stepX;
//                 currentY = stepY;
//             }
//         }

//         // Добавляем рандомную задержку между перемещениями
//         if (i < movements - 1) { // Проверяем, чтобы не ждать после последнего перемещения
//             await new Promise(r => setTimeout(r, delayBetweenMovements));
//         }
//     }
// };

// // Плавное перемещение виртуального курсора по разным координатам на экране
// await moveCursor(page);


// return;