export const CONFIG = {
  // Use local YAML file
  cardsYamlUrl: "./arcsbasegame.yml",
  // Optional additional YAML with expansion cards (we'll load only Fate-tagged cards from this file)
  blightedReachYamlUrl: "./blightedreach.yml",

  // The YAML has `image: BC01` etc; we render `${cardImagesBaseUrl}${image}.png`
  cardImagesBaseUrl:
    "https://raw.githubusercontent.com/buriedgiantstudios/cards/master/content/card-images/arcs/en-US/",

  // Fallback image repository for cards that do not have an explicit YAML image.
  cardImageFallbackBaseUrl:
    "https://raw.githubusercontent.com/Laurens1234/arcs-arsenal/refs/heads/main/Cardimages/",

  // Fallback image repository for leaders loaded from the leader YAML source.
  leaderImageFallbackBaseUrl:
    "https://raw.githubusercontent.com/Laurens1234/Arcs-Leader-Generator/refs/heads/main/results/leader/",

  // Leader YAML used by the custom-cards app as a canonical name source.
  leaderYamlUrl:
    "https://raw.githubusercontent.com/Laurens1234/Arcs-Leader-Generator/main/scripts/data/leaders.yml",

  // Google Sheets may redirect to login unless the file is accessible without auth.
  // Even if “Anyone with the link” is enabled, client-side fetch can still be blocked.
  // If this URL redirects to a login page, use File → Share → Publish to web and paste
  // the published CSV URL here.
  sheetCsvUrl:
    "https://docs.google.com/spreadsheets/d/13Wb-JoX7L2-o3Q-ejvepsx11MW--yhTN5oJ-I4Hp2DU/export?format=csv&gid=1136087345",

  // Name of the column in the sheet that contains the card name.
  // If unknown, we will guess from headers.
  preferredNameColumns: ["Card", "Card Name", "Name"],

  // Personal tier list Google Sheet (CSV export)
  tierListCsvUrl:
    "https://docs.google.com/spreadsheets/d/1DRyF7uWRgXGXJCW_DZbW5nprsXK_l_BzyVLjZBfE4B4/export?format=csv&gid=0",

  // Only show cards with any of these tags. Leave empty to show everything.
  // Example: ["Base Court", "Lore", "Leader"]
  includeAnyTags: [],
  // Optional CSV with synergy values (rows = source tag/lead, columns = target tag/lead).
  // Use a Google Sheets CSV export link (publish or public access recommended).
  // Example: https://docs.google.com/spreadsheets/d/FILE_ID/export?format=csv&gid=0
  synergyCsvUrl:
    "https://docs.google.com/spreadsheets/d/1Ofzfrhi0JHFgniJevYy1u9ParOs5v1vSpUZqElu-6yI/export?format=csv&gid=0",

  // Celestial data - game results with winners determined by highest power
  // Each row represents a player in a game; winner is the player with highest Power in that Game ID
  celestialCsvUrl:
    "https://docs.google.com/spreadsheets/d/1yGuP7IcjnG_jbua4KH57D_68VaEhwOPhMT2yJkxG838/export?format=csv&gid=0",
};
