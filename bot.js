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
  PlayWithFriend: 0,
  PlayWithoutFriend: 0,
  PlayWithFriendWins: 0,
  PlayWithFriendLosses: 0,
  PlayWithoutFriendWins: 0,
  PlayWithoutFriendLosses: 0,
};

// Отключаем устаревшую функцию автоматической отмены промисов
TelegramBot.Promise = Promise;

// Создаем бота с опцией {polling: true} для обработки сообщений
const bot = new TelegramBot(token, { polling: true });
loadHeroes();

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

async function fetchLastMatchStats(playerID) {
  try {
    const url = `${DotaAPI}/players/${playerID}/recentMatches`;
    const response = await fetch(url);
    const recentMatches = await response.json();

    if (recentMatches.length > 0) {
      const matchID = recentMatches[0].match_id;
      const playerNames = await fetchMatchDetails(matchID);
      if (playerNames.length > 0) {
        recentMatches[0].playerName = playerNames.join(", ");
      }
      return new Match(
        recentMatches[0].match_id,
        recentMatches[0].hero_id,
        recentMatches[0].kills,
        recentMatches[0].deaths,
        recentMatches[0].assists,
        recentMatches[0].radiant_win,
        recentMatches[0].player_slot,
        recentMatches[0].playerName
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

function formatMatchStats(match, stats) {
  const heroName = heroes[match.heroID]
    ? heroes[match.heroID].localizedName
    : "Unknown";
  const isRadiant = match.playerSlot < 128;
  const didWin =
    (isRadiant && match.radiantWin) || (!isRadiant && !match.radiantWin);
  const kda =
    match.deaths === 0
      ? match.kills + match.assists
      : (match.kills + match.assists) / match.deaths;
  const playWithFriendRate =
    stats.PlayWithFriend > 0
      ? (stats.PlayWithFriendWins / stats.PlayWithFriend) * 100
      : 0;
  const playWithoutFriendRate =
    stats.PlayWithoutFriend > 0
      ? (stats.PlayWithoutFriendWins / stats.PlayWithoutFriend) * 100
      : 0;
  const result = didWin ? "won" : "lost";

  return (
    `Vlados last match stats:\n` +
    `Hero - ${heroName}\n` +
    `K/D/A - ${match.kills}/${match.deaths}/${
      match.assists
    } (KDA: ${kda.toFixed(2)})\n` +
    `Result(TEST) - ${result}\n` +
    `Played with - ${match.playerName}\n` +
    `Total games with friends: ${stats.PlayWithFriend}\n` +
    `Total games without friends: ${stats.PlayWithoutFriend}\n` +
    `Win rate with friends: ${playWithFriendRate.toFixed(2)}%\n` +
    `Win rate without friends: ${playWithoutFriendRate.toFixed(2)}%`
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
