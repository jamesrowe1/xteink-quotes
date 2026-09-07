const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const bmp = require("bmp-js");

// ============================================================
// CONFIG
// ============================================================

// XTEINK X4 native portrait resolution
const WIDTH = 480;
const HEIGHT = 800;

// Number of sleep screens to make
const QUOTE_COUNT = 100;

// Keep quotes reasonably short so they're readable
const MIN_CHARS = 20;
const MAX_CHARS = 200;

// Change this number if you want a completely different
// selection/order of quotes.
const RANDOM_SEED = 20260813;

// Quote database
const QUOTES_URL =
  "https://raw.githubusercontent.com/dwyl/quotes/main/quotes.json";

const CACHE_FILE = path.join(__dirname, "quotes-cache.json");
const SELECTED_FILE = path.join(__dirname, "selected-quotes.json");
const OUTPUT_DIR = path.join(__dirname, ".sleep");

// ============================================================
// PREFERRED / FAMOUS AUTHORS
// ============================================================
//
// Quotes by these people are selected first.
//
// If there aren't enough to reach 500, the program automatically
// fills the rest from the complete quote collection.
//

const PREFERRED_AUTHORS = [
  "Abraham Lincoln",
  "Albert Einstein",
  "Alexander Graham Bell",
  "Alexander Pope",
  "Anne Frank",
  "Aristotle",
  "Arthur Schopenhauer",
  "Audrey Hepburn",
  "Benjamin Franklin",
  "Bertrand Russell",
  "Bill Gates",
  "Blaise Pascal",
  "Bob Dylan",
  "Bruce Lee",
  "Buddha",
  "Carl Jung",
  "Charles Darwin",
  "Charles Dickens",
  "Charlie Chaplin",
  "Christopher Columbus",
  "Cicero",
  "Confucius",
  "C. S. Lewis",
  "C.S. Lewis",
  "Dalai Lama",
  "Dale Carnegie",
  "Desmond Tutu",
  "Dr. Seuss",
  "Dwight D. Eisenhower",
  "Eleanor Roosevelt",
  "Elon Musk",
  "Emily Dickinson",
  "Epictetus",
  "Ernest Hemingway",
  "F. Scott Fitzgerald",
  "Francis Bacon",
  "Franklin D. Roosevelt",
  "Franz Kafka",
  "Frederick Douglass",
  "Friedrich Nietzsche",
  "Fyodor Dostoevsky",
  "Galileo Galilei",
  "George Bernard Shaw",
  "George Orwell",
  "George Washington",
  "Henry David Thoreau",
  "Henry Ford",
  "Helen Keller",
  "Homer",
  "Isaac Newton",
  "Jack Kerouac",
  "Jane Austen",
  "Jean-Paul Sartre",
  "Jiddu Krishnamurti",
  "Jim Morrison",
  "John F. Kennedy",
  "John Lennon",
  "John Locke",
  "John Muir",
  "J. R. R. Tolkien",
  "J.R.R. Tolkien",
  "J. K. Rowling",
  "J.K. Rowling",
  "Kahlil Gibran",
  "Khalil Gibran",
  "Kurt Vonnegut",
  "Lao Tzu",
  "Leonardo da Vinci",
  "Leo Tolstoy",
  "Lewis Carroll",
  "Lucius Annaeus Seneca",
  "Malcolm X",
  "Marcus Aurelius",
  "Margaret Mead",
  "Marie Curie",
  "Mark Twain",
  "Martin Luther King",
  "Martin Luther King Jr.",
  "Martin Luther King, Jr.",
  "Maya Angelou",
  "Michelangelo",
  "Mahatma Gandhi",
  "Mother Teresa",
  "Napoleon Bonaparte",
  "Nelson Mandela",
  "Nikola Tesla",
  "Oscar Wilde",
  "Pablo Picasso",
  "Paulo Coelho",
  "Plato",
  "Ralph Waldo Emerson",
  "Ray Bradbury",
  "Richard Feynman",
  "Robert Frost",
  "Robin Williams",
  "Rumi",
  "Seneca",
  "Socrates",
  "Stephen Hawking",
  "Stephen King",
  "Steve Jobs",
  "Sun Tzu",
  "Theodore Roosevelt",
  "Thomas Edison",
  "Thomas Jefferson",
  "Victor Hugo",
  "Virginia Woolf",
  "Voltaire",
  "Walt Disney",
  "William Shakespeare",
  "Winston Churchill"
];

// Convert to lowercase so matching is forgiving
const preferredLower = PREFERRED_AUTHORS.map((x) =>
  x.toLowerCase()
);

// ============================================================
// RANDOM NUMBER GENERATOR
// ============================================================
//
// A seeded generator means:
//
// run it today -> same 500
// run it tomorrow -> same 500
//
// Change RANDOM_SEED -> different 500
//

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(RANDOM_SEED);

function shuffle(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));

    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

// ============================================================
// TEXT HELPERS
// ============================================================

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizedQuote(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[“”"'‘’.,!?;:—–-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// QUOTE DATABASE
// ============================================================

async function getQuotes() {
  // If we've already downloaded them, use the local copy.
  if (fs.existsSync(CACHE_FILE)) {
    console.log("Loading cached quote database...");

    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  }

  console.log("Downloading quote database...");

  const response = await fetch(QUOTES_URL);

  if (!response.ok) {
    throw new Error(
      `Could not download quotes: HTTP ${response.status}`
    );
  }

  const quotes = await response.json();

  fs.writeFileSync(
    CACHE_FILE,
    JSON.stringify(quotes, null, 2),
    "utf8"
  );

  console.log(`Saved ${quotes.length} quotes to quotes-cache.json`);

  return quotes;
}

// ============================================================
// FILTER QUOTES
// ============================================================

function prepareQuotes(rawQuotes) {
  const seen = new Set();

  const valid = [];

  for (const item of rawQuotes) {
    const text = cleanText(item.text);
    const author = cleanText(item.author);

    if (!text || !author) {
      continue;
    }

    if (text.length < MIN_CHARS) {
      continue;
    }

    if (text.length > MAX_CHARS) {
      continue;
    }

    const normalized = normalizedQuote(text);

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);

    valid.push({
      text,
      author,
      source: item.source || null,
      tags: item.tags || null
    });
  }

  console.log(
    `${valid.length} usable unique quotes after filtering.`
  );

  return valid;
}

function authorIsPreferred(author) {
  const normalized = author.toLowerCase();

  return preferredLower.some((famous) => {
    return (
      normalized === famous ||
      normalized.includes(famous) ||
      famous.includes(normalized)
    );
  });
}

function selectQuotes(allQuotes) {
  const famous = [];
  const others = [];

  for (const quote of allQuotes) {
    if (authorIsPreferred(quote.author)) {
      famous.push(quote);
    } else {
      others.push(quote);
    }
  }

  console.log(
    `${famous.length} quotes found from preferred famous authors.`
  );

  const selected = [];

  const shuffledFamous = shuffle(famous);
  const shuffledOthers = shuffle(others);

  // First use recognizable names
  for (const quote of shuffledFamous) {
    if (selected.length >= QUOTE_COUNT) break;

    selected.push(quote);
  }

  // Then fill to 500 if necessary
  for (const quote of shuffledOthers) {
    if (selected.length >= QUOTE_COUNT) break;

    selected.push(quote);
  }

  if (selected.length < QUOTE_COUNT) {
    throw new Error(
      `Only found ${selected.length} suitable quotes.`
    );
  }

  // Shuffle the final selection so Einstein/Churchill/etc.
  // aren't grouped together.
  return shuffle(selected);
}

// ============================================================
// WORD WRAPPING
// ============================================================

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);

  const lines = [];

  let current = "";

  for (const word of words) {
    const proposed =
      current.length === 0 ? word : `${current} ${word}`;

    if (proposed.length <= maxChars) {
      current = proposed;
    } else {
      if (current) {
        lines.push(current);
      }

      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

// ============================================================
// FONT SIZE
// ============================================================
//
// We don't just make long quotes tiny.
//
// Instead, test progressively smaller fonts until the quote fits
// comfortably into the center area.
//

function calculateLayout(text) {
  const availableWidth = 390;
  const availableHeight = 430;

  for (let fontSize = 58; fontSize >= 30; fontSize -= 2) {
    // Average serif character width is roughly half the font size.
    const approximateCharWidth = fontSize * 0.52;

    const maxChars = Math.max(
      12,
      Math.floor(availableWidth / approximateCharWidth)
    );

    const lines = wrapText(text, maxChars);

    const lineHeight = Math.round(fontSize * 1.25);

    const textHeight = lines.length * lineHeight;

    if (
      textHeight <= availableHeight &&
      lines.length <= 9
    ) {
      return {
        fontSize,
        lineHeight,
        lines
      };
    }
  }

  // Emergency fallback
  return {
    fontSize: 28,
    lineHeight: 35,
    lines: wrapText(text, 26)
  };
}

// ============================================================
// SVG GENERATION
// ============================================================

function quoteToSvg(quote) {
  const { text, author } = quote;

  const layout = calculateLayout(text);

  const blockHeight =
    layout.lines.length * layout.lineHeight;

  // Center quote text vertically around roughly the middle
  const blockCenter = 380;

  const startY =
    blockCenter -
    blockHeight / 2 +
    layout.fontSize;

  const textLines = layout.lines
    .map((line, index) => {
      const y =
        startY + index * layout.lineHeight;

      return `
        <text
          x="240"
          y="${y}"
          text-anchor="middle"
          font-family="Georgia, 'Times New Roman', serif"
          font-size="${layout.fontSize}"
          font-weight="400"
          fill="#000000"
        >${escapeXml(line)}</text>
      `;
    })
    .join("\n");

  const safeAuthor = escapeXml(author);

  return `
  <svg
    width="${WIDTH}"
    height="${HEIGHT}"
    viewBox="0 0 ${WIDTH} ${HEIGHT}"
    xmlns="http://www.w3.org/2000/svg"
  >

    <!-- Background -->
    <rect
      x="0"
      y="0"
      width="${WIDTH}"
      height="${HEIGHT}"
      fill="#ffffff"
    />

    <!-- Large opening quote -->
    <text
      x="45"
      y="145"
      font-family="Georgia, 'Times New Roman', serif"
      font-size="120"
      fill="#000000"
    >“</text>

    <!-- Quote -->
    ${textLines}

    <!-- Divider -->
    <line
      x1="160"
      y1="625"
      x2="320"
      y2="625"
      stroke="#000000"
      stroke-width="2"
    />

    <!-- Author -->
    <text
      x="240"
      y="680"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="27"
      font-weight="600"
      fill="#000000"
    >${safeAuthor}</text>

  </svg>
  `;
}

// ============================================================
// SVG -> 24-BIT BMP
// ============================================================

async function renderBmp(quote, outputPath) {
  const svg = quoteToSvg(quote);

  // Sharp renders SVG into RGBA raw pixel data.
  const result = await sharp(Buffer.from(svg))
    .resize(WIDTH, HEIGHT, {
      fit: "fill"
    })
    .ensureAlpha()
    .raw()
    .toBuffer({
      resolveWithObject: true
    });

  const rgba = result.data;

  // bmp-js expects 4 bytes per source pixel in:
  //
  // A B G R
  //
  // Sharp gave us:
  //
  // R G B A
  //
  // so reorder them.

  const abgr = Buffer.alloc(
    WIDTH * HEIGHT * 4
  );

  for (
    let source = 0, destination = 0;
    source < rgba.length;
    source += 4, destination += 4
  ) {
    const r = rgba[source];
    const g = rgba[source + 1];
    const b = rgba[source + 2];
    const a = rgba[source + 3];

    abgr[destination] = a;
    abgr[destination + 1] = b;
    abgr[destination + 2] = g;
    abgr[destination + 3] = r;
  }

  const encoded = bmp.encode({
    data: abgr,
    width: WIDTH,
    height: HEIGHT
  });

  fs.writeFileSync(outputPath, encoded.data);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("");
  console.log("========================================");
  console.log(" XTEINK X4 FAMOUS QUOTE GENERATOR");
  console.log("========================================");
  console.log("");

  console.log(`Screen: ${WIDTH}x${HEIGHT}`);
  console.log(`Quote count: ${QUOTE_COUNT}`);
  console.log("");

  // --------------------------------------------------------
  // LOAD
  // --------------------------------------------------------

  const rawQuotes = await getQuotes();

  console.log(
    `Database contains ${rawQuotes.length} total quotes.`
  );

  // --------------------------------------------------------
  // FILTER
  // --------------------------------------------------------

  const usableQuotes =
    prepareQuotes(rawQuotes);

  // --------------------------------------------------------
  // SELECT
  // --------------------------------------------------------

  const selectedQuotes =
    selectQuotes(usableQuotes);

  fs.writeFileSync(
    SELECTED_FILE,
    JSON.stringify(selectedQuotes, null, 2),
    "utf8"
  );

  console.log(
    `Saved quote list to selected-quotes.json`
  );

  // --------------------------------------------------------
  // CLEAN OUTPUT
  // --------------------------------------------------------

  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, {
      recursive: true,
      force: true
    });
  }

  fs.mkdirSync(OUTPUT_DIR, {
    recursive: true
  });

  // --------------------------------------------------------
  // RENDER
  // --------------------------------------------------------

  console.log("");
  console.log("Generating BMP files...");
  console.log("");

  for (
    let index = 0;
    index < selectedQuotes.length;
    index++
  ) {
    const quote = selectedQuotes[index];

    const number = String(index + 1).padStart(
      3,
      "0"
    );

    const filename =
      `quote-${number}.bmp`;

    const destination = path.join(
      OUTPUT_DIR,
      filename
    );

    await renderBmp(
      quote,
      destination
    );

    console.log(
      `[${number}/${QUOTE_COUNT}] ` +
        `${quote.author}: ` +
        `${quote.text.substring(0, 55)}` +
        `${quote.text.length > 55 ? "..." : ""}`
    );
  }

  console.log("");
  console.log("========================================");
  console.log(" DONE");
  console.log("========================================");
  console.log("");
  console.log(
    `Created ${selectedQuotes.length} BMP files`
  );
  console.log(
    `Location: ${OUTPUT_DIR}`
  );
  console.log("");
  console.log(
    "Copy the .sleep folder/files to your XTEINK X4."
  );
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("ERROR:");
  console.error(error);
  process.exit(1);
});