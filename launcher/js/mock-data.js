/* Sample media for designing without a SIMKL connection.
   The shape matches what sources.js will produce from SIMKL. Artwork here is
   placeholder photography; real posters and backdrops come from SIMKL. */
window.HOMEOS_MOCK = (function () {
  function img(seed, w, h) { return "https://picsum.photos/seed/" + seed + "/" + w + "/" + h; }
  function m(o) {
    o.kind = "media";
    o.backdrop = img(o.seed, 1920, 1080);
    o.still = img(o.seed, 640, 360);
    return o;
  }

  return {
    continueWatching: [
      m({ seed: "devilsplan", type: "series", title: "The Devil's Plan", episode: "S3 E1", season: 3, number: 1, episodeTitle: "Episode 1", state: "new", network: "Netflix", imdbRating: 7.9, runtime: 70, epRuntime: 76, year: 2023, genres: ["Game Show", "Reality"], synopsis: "In this mind-bending game of survival hosted by \"the Devil,\" contestants have one week to be crowned the brainiest player and win the ultimate prize." }),
      m({ seed: "slowhorses", type: "series", imdb: "tt5875444", title: "Slow Horses", network: "Apple TV+", imdbRating: 8.2, runtime: 48, epRuntime: 51, episode: "S4 E5", episodeTitle: "Hello Goodbye", progress: 0.62, remaining: "19 min left", year: 2022, genres: ["Thriller", "Drama"], synopsis: "A dysfunctional team of MI5 agents, banished to Slough House for career-ending mistakes, are drawn into a case that goes badly wrong." }),
      m({ seed: "severance", type: "series", imdb: "tt11280740", title: "Severance", episode: "S2 E3", episodeTitle: "Who Is Alive?", progress: 0.24, remaining: "41 min left", year: 2022, genres: ["Sci-Fi", "Mystery"], synopsis: "Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives." }),
      m({ seed: "dunetwo", type: "movie", imdb: "tt15239678", title: "Dune: Part Two", imdbRating: 8.5, runtime: 166, progress: 0.48, remaining: "1 hr 25 min left", year: 2024, genres: ["Sci-Fi", "Adventure"], synopsis: "Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family." }),
      m({ seed: "thebear", type: "series", imdb: "tt14452776", title: "The Bear", episode: "S3 E2", episodeTitle: "Next", progress: 0.81, remaining: "6 min left", year: 2022, genres: ["Drama", "Comedy"], synopsis: "A young chef from the fine-dining world comes home to Chicago to run his family's sandwich shop." }),
      m({ seed: "andor", type: "series", imdb: "tt9253284", title: "Andor", episode: "S2 E1", episodeTitle: "One Year Later", progress: 0.1, remaining: "44 min left", year: 2022, genres: ["Sci-Fi", "Action"], synopsis: "Cassian Andor's path from thief to rebel, in the years when the Rebellion was taking shape." })
    ],
    upNext: [
      m({ seed: "shogun", type: "series", imdb: "tt2788316", title: "Shōgun", episode: "S1 E1", note: "Plan to watch", year: 2024, genres: ["Drama", "History"], synopsis: "In feudal Japan, Lord Toranaga fights for his life as his enemies on the Council of Regents unite against him." }),
      m({ seed: "oppenheimer", type: "movie", imdb: "tt15398776", title: "Oppenheimer", note: "Plan to watch", year: 2023, genres: ["Drama", "History"], synopsis: "The story of J. Robert Oppenheimer and his role in the development of the atomic bomb." }),
      m({ seed: "penguin", type: "series", imdb: "tt15435876", title: "The Penguin", episode: "S1 E1", note: "New episode", year: 2024, genres: ["Crime", "Drama"], synopsis: "Oz Cobb makes a play to seize the reins of the crime world in Gotham." }),
      m({ seed: "pastlives", type: "movie", imdb: "tt13238346", title: "Past Lives", note: "Plan to watch", year: 2023, genres: ["Romance", "Drama"], synopsis: "Two deeply connected childhood friends are reunited for one fateful week in New York." })
    ],
    recommended: [
      m({ seed: "mrrobot", type: "series", imdb: "tt4158110", title: "Mr. Robot", note: "Because you watched Severance", year: 2015, genres: ["Thriller", "Drama"], synopsis: "A cyber-security engineer is recruited by a mysterious anarchist to join a group of hacktivists." }),
      m({ seed: "tinkertailor", type: "movie", imdb: "tt1340800", title: "Tinker Tailor Soldier Spy", note: "Because you watched Slow Horses", year: 2011, genres: ["Thriller"], synopsis: "In the bleak days of the Cold War, an espionage veteran is called out of retirement to uncover a Soviet mole." }),
      m({ seed: "arrival", type: "movie", imdb: "tt2543164", title: "Arrival", note: "Because you watched Dune: Part Two", year: 2016, genres: ["Sci-Fi", "Drama"], synopsis: "A linguist works with the military to communicate with alien lifeforms after twelve mysterious spacecraft appear." }),
      m({ seed: "succession", type: "series", imdb: "tt7660850", title: "Succession", note: "Trending on SIMKL", year: 2018, genres: ["Drama"], synopsis: "The Roy family controls one of the biggest media and entertainment conglomerates in the world." }),
      m({ seed: "blackbird", type: "series", imdb: "tt4786824", title: "The Crown", note: "Trending on SIMKL", year: 2016, genres: ["Drama", "History"], synopsis: "Follows the political rivalries and romance of Queen Elizabeth II's reign." })
    ]
  };
})();
