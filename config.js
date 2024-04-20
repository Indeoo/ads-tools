// НАСТРОЙКИ СКРИПТА:
export const RUN_QUESTS = true;                    //если true - то выполняет квесты
export const DELAY_BETWEEN_QUESTS = [11e3, 19e3];  //задержка от 11 до 33 секунд между квестами;
export const DELAY_START = [8e3, 15e3];            //задержка от 8 до 15 секунд на старт первого квеста после открытия страницы парка.
export const DELAY_BROWSER = [10e3, 17e3];         //ЛУЧШЕ НЕ УМЕНЬШАТЬ, АДС И ТАК ЛАГАЕТ, А ЕСЛИ ТАЧКА НАГРУЖЕНА, ТО БУДУТ КРИТЫ! (задержка между стартом браузеров.)
export const DELAY_BROWSER_CLOSE = [12e3, 18e3];
export const LOGIN_METAMASK_FIRST = true;          //логинить ли метамаск с паролем METAMASK_PW ?
export const SHUFFLE_PROFILES = true;              //перемешать ли профили? лучше запускать в рандомном порядке, так как создаваться они могли поочереди.
export const DEBUG_QUESTS_BUTTONS = false;          //если false - то не будет выводить логи кнопок по квестам и срать в терминал
export const LOG_SAFE_CLICKS = false;
export const ADD_CURSOR = true;                    //использовать ли курсор на страницах, чтобы снизить риск отлёта в сибил
export const METAMASK_PW = '123123qwe';
export const METAMASK_PW_2 = '123123qwe';   //если заполнено, значит что вдруг если метамаск введет первый пароль и он окажется неправильным, то введет второй пароль
export const ADS_PORT = 50325;
export const CAPTCHA_MONSTER = false;              //если включено то задает пароль и проверяет настроена ли каптча монстер в браузере
export const CAPTCHA_MONSTER_API_KEY = '';
export const FREEZE_QUEST_RESTART_INTERVAL = 150; //если скрипт за 150 секунд не сделал квест и не начал новый, то ребутаем его. иначе бы он закрылся сам, если бы было что делать по квестам
export const API_KEY = 'MCTQAQSMPXLQJTTQQAFH';

export const BROWSER = {                                  //настройка браузера, разрешение, старт плитки если grid = true
  windowWidth: 1920,
  windowHeight: 1080,
  startX: 0,
  startY: 0,
  grid: false
}
// КОНЕЦ НАСТРОЕК