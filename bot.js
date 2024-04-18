const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");
require("dotenv").config();

const PlayerID = "92154455";
const DotaAPI = "http://api.opendota.com/api";
let lastCheckedMatchID = 0;
const chatIDs = new Map();
const token = process.env.TELEGRAM_TOKEN;
let heroes = {};
let stats = {
  PlayWithFriend: 12,
  PlayWithoutFriend: 3,
  PlayWithFriendWins: 6,
  PlayWithFriendLosses: 0,
  PlayWithoutFriendWins: 0,
  PlayWithoutFriendLosses: 0,
};

// Отключаем устаревшую функцию автоматической отмены промисов
TelegramBot.Promise = Promise;

const bot = new TelegramBot(token, { polling: true });
loadHeroes();

setInterval(checkForNewMatches, 60000); // Проверяем новые матчи каждые 4 минуты

bot.on("message", (msg) => {
  if (!msg.text) return;
  const chatID = msg.chat.id;
  chatIDs.set(chatID, true);

  if (msg.text.startsWith("/lastmatch")) {
    fetchLastMatchStats(PlayerID).then((lastMatchStats) => {
      const formattedMessage = formatMatchStats(lastMatchStats, stats);
      bot.sendMessage(chatID, formattedMessage);
    });
  }
});

async function loadHeroes() {
  try {
    const response = await fetch(DotaAPI + "/heroes");
    const heroesData = await response.json();
    heroes = heroesData.reduce((acc, hero) => {
      acc[hero.id] = new Hero(hero.id, hero.name, hero.localized_name);
      return acc;
    }, {});
  } catch (error) {
    console.error("Error fetching or parsing heroes data:", error);
  }
}

async function checkForNewMatches() {
  const lastMatchStats = await fetchLastMatchStats(PlayerID);
  if (lastMatchStats && lastMatchStats.matchID !== lastCheckedMatchID) {
    lastCheckedMatchID = lastMatchStats.matchID;
    updateStats(lastMatchStats, lastMatchStats.playerName.length > 0);
    sendMatchStats(lastMatchStats);
  }
}

async function fetchLastMatchStats(playerID) {
  try {
    const url = `${DotaAPI}/players/${playerID}/recentMatches`;
    const response = await fetch(url);
    const recentMatches = await response.json();

    if (recentMatches.length > 0) {
      const match = recentMatches[0];
      const playerNames = await fetchMatchDetails(match.match_id);
      const playerName = playerNames.join(", ");
      return new Match(
        match.match_id,
        match.hero_id,
        match.kills,
        match.deaths,
        match.assists,
        match.radiant_win,
        match.player_slot,
        playerName
      );
    }
  } catch (error) {
    console.error("Error fetching or parsing recent matches data:", error);
    return new Match();
  }
  return new Match();
}

async function fetchMatchDetails(matchID) {
  try {
    const url = `https://api.opendota.com/api/matches/${matchID}`;
    const response = await fetch(url);
    const matchDetails = await response.json();

    const validNames = new Set([
      "Fun* [3rd]",
      "Fun* [2nd]",
      "Fun* [rzns]",
      "Iлюха Звiр",
      "SpivaK",
      "Ȼαþĭϯαņ Ǥѡƴȡĭøņ",
      "YobyDal",
    ]);
    const playerNames = matchDetails.players
      .filter((player) => validNames.has(player.personaname))
      .map((player) => player.personaname);

    return playerNames;
  } catch (error) {
    console.error("Error fetching match details:", error);
    return [];
  }
}

function sendMatchStats(lastMatchStats) {
  const formattedMessage = formatMatchStats(lastMatchStats, stats);
  chatIDs.forEach((chatID) => {
    bot.sendMessage(chatID, formattedMessage);
  });
}

function updateStats(match, playedWithFriend) {
  const didWin = match.radiantWin == match.playerSlot < 128;
  if (playedWithFriend) {
    stats.PlayWithFriend++;
    if (didWin) {
      stats.PlayWithFriendWins++;
    } else {
      stats.PlayWithFriendLosses++;
    }
  } else {
    stats.PlayWithoutFriend++;
    if (didWin) {
      stats.PlayWithoutFriendWins++;
    } else {
      stats.PlayWithoutFriendLosses++;
    }
  }
}

function formatMatchStats(match, stats) {
  const heroName = heroes[match.heroID]
    ? heroes[match.heroID].localizedName
    : "Unknown";
  const kda =
    match.deaths === 0
      ? match.kills + match.assists
      : (match.kills + match.assists) / match.deaths;
  const result = match.radiantWin == match.playerSlot < 128 ? "won" : "lost";
  const playWithFriendRate =
    stats.PlayWithFriend > 0
      ? ((stats.PlayWithFriendWins / stats.PlayWithFriend) * 100).toFixed(2)
      : "0.00";
  const playWithoutFriendRate =
    stats.PlayWithoutFriend > 0
      ? ((stats.PlayWithoutFriendWins / stats.PlayWithoutFriend) * 100).toFixed(
          2
        )
      : "0.00";

  return (
    `Vlados last match stats:\n` +
    `Герой - ${heroName}\n` +
    `K/D/A - ${match.kills}/${match.deaths}/${
      match.assists
    } (KDA: ${kda.toFixed(2)})\n` +
    `Результат - ${result}\n` +
    `Забущен кем - ${match.playerName}\n` +
    `Всего игр с друзьями: ${stats.PlayWithFriend}\n` +
    `Всего игр без друзей: ${stats.PlayWithoutFriend}\n` +
    `Win rate играя с друзьями: ${playWithFriendRate.toFixed(2)}%\n` +
    `Win rate играя без друзей: ${playWithoutFriendRate.toFixed(2)}%`
  );
}

class Hero {
  constructor(id, name, localizedName) {
    this.id = id;
    this.name = name;
    this.localizedName = localizedName;
  }
}

class Match {
  constructor(
    matchID,
    heroID,
    kills,
    deaths,
    assists,
    radiantWin,
    playerSlot,
    playerName = ""
  ) {
    this.matchID = matchID;
    this.heroID = heroID;
    this.kills = kills;
    this.deaths = deaths;
    this.assists = assists;
    this.radiantWin = radiantWin;
    this.playerSlot = playerSlot;
    this.playerName = playerName;
  }
}
