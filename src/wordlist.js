/* Shared word list for 3-word publish codes (word-word-word).
   Exactly 1024 unique words (32 groups of 32) → 1024³ ≈ 1.07e12 codes.
   All words are simple, lowercase, single tokens — easy for kids to read,
   say, and type. Edit this list to change the code space. */

const GROUPS = [
  // fruits
  ['apple', 'banana', 'cherry', 'grape', 'mango', 'peach', 'lemon', 'lime', 'kiwi', 'plum', 'pear', 'fig', 'papaya', 'guava', 'olive', 'tomato', 'apricot', 'prune', 'pomegranate', 'watermelon', 'tangerine', 'nectarine', 'cranberry', 'blueberry', 'raspberry', 'blackberry', 'strawberry', 'coconut', 'date', 'melon', 'berry', 'orange'],
  // mammals
  ['cat', 'dog', 'horse', 'cow', 'pig', 'sheep', 'goat', 'mouse', 'rabbit', 'fox', 'wolf', 'bear', 'lion', 'tiger', 'zebra', 'monkey', 'panda', 'kangaroo', 'koala', 'giraffe', 'elephant', 'rhino', 'hippo', 'otter', 'seal', 'moose', 'llama', 'alpaca', 'bison', 'yak', 'dolphin', 'narwhal'],
  // birds
  ['duck', 'chicken', 'eagle', 'hawk', 'owl', 'crow', 'sparrow', 'robin', 'pigeon', 'swan', 'goose', 'turkey', 'peacock', 'parrot', 'penguin', 'flamingo', 'swallow', 'starling', 'heron', 'pelican', 'woodpecker', 'finch', 'wren', 'thrush', 'magpie', 'gull', 'ostrich', 'emu', 'crane', 'kestrel', 'toucan', 'dove'],
  // insects
  ['bee', 'wasp', 'fly', 'moth', 'beetle', 'hornet', 'mayfly', 'cicada', 'grasshopper', 'locust', 'mantis', 'weevil', 'termite', 'roach', 'ladybug', 'butterfly', 'dragonfly', 'firefly', 'earwig', 'aphid', 'flea', 'tick', 'louse', 'mite', 'silkworm', 'bumblebee', 'bedbug', 'silverfish', 'katydid', 'caddis', 'chigger', 'sawfly'],
  // sea creatures
  ['fish', 'shark', 'tuna', 'salmon', 'trout', 'carp', 'cod', 'eel', 'pike', 'perch', 'bass', 'mackerel', 'sardine', 'herring', 'anchovy', 'flounder', 'crab', 'lobster', 'shrimp', 'prawn', 'oyster', 'mussel', 'clam', 'coral', 'jellyfish', 'urchin', 'starfish', 'seahorse', 'octopus', 'squid', 'anemone', 'whale'],
  // colors
  ['red', 'blue', 'green', 'yellow', 'purple', 'pink', 'black', 'white', 'gray', 'brown', 'beige', 'cyan', 'magenta', 'maroon', 'silver', 'gold', 'copper', 'bronze', 'cream', 'ivory', 'tan', 'rust', 'teal', 'indigo', 'violet', 'azure', 'scarlet', 'crimson', 'jade', 'amber', 'khaki', 'navy'],
  // shapes
  ['circle', 'square', 'triangle', 'rectangle', 'oval', 'ellipse', 'diamond', 'hexagon', 'octagon', 'pentagon', 'heptagon', 'nonagon', 'decagon', 'star', 'heart', 'cross', 'crescent', 'sphere', 'cube', 'cone', 'cylinder', 'pyramid', 'prism', 'torus', 'polygon', 'rhombus', 'trapezoid', 'semicircle', 'spiral', 'zigzag', 'dot', 'line'],
  // weather
  ['rain', 'snow', 'wind', 'cloud', 'storm', 'thunder', 'lightning', 'fog', 'mist', 'hail', 'sleet', 'drizzle', 'rainbow', 'sun', 'heatwave', 'frost', 'ice', 'breeze', 'gust', 'downpour', 'shower', 'hurricane', 'tornado', 'blizzard', 'cyclone', 'monsoon', 'humidity', 'dew', 'spray', 'squall', 'flurries', 'drought'],
  // nature
  ['mountain', 'hill', 'valley', 'forest', 'jungle', 'desert', 'island', 'beach', 'river', 'stream', 'lake', 'pond', 'ocean', 'sea', 'bay', 'reef', 'dune', 'meadow', 'field', 'grass', 'moss', 'rock', 'stone', 'pebble', 'boulder', 'cliff', 'canyon', 'volcano', 'glacier', 'waterfall', 'spring', 'moon'],
  // flowers and plants
  ['flower', 'rose', 'tulip', 'daisy', 'lily', 'orchid', 'sunflower', 'dandelion', 'iris', 'poppy', 'lotus', 'jasmine', 'lavender', 'marigold', 'peony', 'hibiscus', 'camellia', 'magnolia', 'petal', 'leaf', 'branch', 'twig', 'trunk', 'root', 'vine', 'stem', 'bud', 'bloom', 'seed', 'sprout', 'fern', 'bush'],
  // vegetables
  ['carrot', 'potato', 'onion', 'garlic', 'pepper', 'corn', 'pea', 'bean', 'spinach', 'lettuce', 'broccoli', 'cauliflower', 'cabbage', 'celery', 'cucumber', 'radish', 'turnip', 'beet', 'pumpkin', 'squash', 'zucchini', 'eggplant', 'mushroom', 'asparagus', 'artichoke', 'parsnip', 'rutabaga', 'horseradish', 'endive', 'leek', 'arugula', 'chive'],
  // food and drink
  ['bread', 'butter', 'cheese', 'milk', 'water', 'juice', 'coffee', 'tea', 'honey', 'sugar', 'salt', 'cookie', 'cake', 'pie', 'toast', 'cereal', 'noodle', 'rice', 'soup', 'salad', 'sandwich', 'burger', 'pizza', 'pasta', 'candy', 'chocolate', 'popsicle', 'popcorn', 'pretzel', 'waffle', 'pancake', 'yogurt'],
  // body
  ['head', 'hair', 'face', 'eye', 'ear', 'nose', 'mouth', 'lip', 'tooth', 'tongue', 'chin', 'cheek', 'jaw', 'neck', 'shoulder', 'arm', 'elbow', 'wrist', 'hand', 'finger', 'thumb', 'chest', 'back', 'belly', 'hip', 'waist', 'knee', 'leg', 'ankle', 'foot', 'toe', 'heel'],
  // home
  ['house', 'roof', 'door', 'window', 'wall', 'floor', 'ceiling', 'room', 'hall', 'stairs', 'bed', 'pillow', 'blanket', 'lamp', 'chair', 'table', 'sofa', 'mirror', 'clock', 'carpet', 'curtain', 'shelf', 'closet', 'drawer', 'rug', 'vase', 'candle', 'key', 'lock', 'fence', 'mailbox', 'porch'],
  // kitchen
  ['pot', 'pan', 'spoon', 'fork', 'knife', 'plate', 'bowl', 'cup', 'glass', 'mug', 'saucer', 'kettle', 'fridge', 'oven', 'stove', 'sink', 'dish', 'napkin', 'tray', 'whisk', 'peeler', 'grater', 'colander', 'toaster', 'blender', 'mixer', 'grill', 'tongs', 'ladle', 'strainer', 'coaster', 'spatula'],
  // school
  ['school', 'book', 'pen', 'pencil', 'paper', 'notebook', 'ruler', 'eraser', 'glue', 'scissors', 'crayon', 'marker', 'chalk', 'desk', 'board', 'backpack', 'bag', 'map', 'globe', 'compass', 'alphabet', 'letter', 'number', 'question', 'answer', 'lesson', 'homework', 'teacher', 'student', 'class', 'grade', 'diploma'],
  // sports
  ['sport', 'game', 'ball', 'soccer', 'football', 'baseball', 'basketball', 'tennis', 'golf', 'hockey', 'rugby', 'volleyball', 'badminton', 'swimming', 'running', 'jumping', 'cycling', 'skiing', 'skating', 'boxing', 'karate', 'yoga', 'chess', 'darts', 'archery', 'bowling', 'surfing', 'sailing', 'diving', 'climbing', 'racing', 'marathon'],
  // music
  ['music', 'song', 'melody', 'rhythm', 'beat', 'note', 'chord', 'harmony', 'lyric', 'verse', 'chorus', 'tune', 'tempo', 'pitch', 'scale', 'bar', 'measure', 'crescendo', 'staccato', 'brass', 'string', 'percussion', 'drum', 'treble', 'soprano', 'tenor', 'baritone', 'alto', 'choir', 'concert', 'opera', 'gig'],
  // instruments
  ['guitar', 'piano', 'violin', 'flute', 'saxophone', 'trumpet', 'trombone', 'tuba', 'harp', 'organ', 'cello', 'mandolin', 'ukulele', 'banjo', 'fiddle', 'harpsichord', 'accordion', 'harmonica', 'xylophone', 'maracas', 'tambourine', 'bongo', 'conga', 'timpani', 'gong', 'bell', 'cymbal', 'sitar', 'bagpipes', 'ocarina', 'shaker', 'djembe'],
  // vehicles
  ['car', 'truck', 'bus', 'van', 'taxi', 'train', 'subway', 'tram', 'bike', 'scooter', 'motorcycle', 'moped', 'boat', 'ship', 'yacht', 'canoe', 'kayak', 'raft', 'ferry', 'submarine', 'rocket', 'plane', 'jet', 'helicopter', 'glider', 'balloon', 'zeppelin', 'carriage', 'cart', 'wagon', 'tractor', 'ambulance'],
  // places
  ['city', 'town', 'village', 'street', 'road', 'avenue', 'bridge', 'tunnel', 'park', 'garden', 'plaza', 'crossroads', 'market', 'mall', 'shop', 'store', 'bank', 'post', 'library', 'museum', 'theater', 'cinema', 'hospital', 'church', 'castle', 'palace', 'tower', 'stadium', 'airport', 'harbor', 'lagoon', 'resort'],
  // time
  ['time', 'hour', 'minute', 'second', 'morning', 'noon', 'afternoon', 'evening', 'night', 'midnight', 'dawn', 'dusk', 'day', 'week', 'month', 'year', 'decade', 'century', 'era', 'today', 'tomorrow', 'yesterday', 'now', 'soon', 'later', 'early', 'late', 'moment', 'instant', 'forever', 'always', 'never'],
  // feelings
  ['happy', 'sad', 'angry', 'scared', 'brave', 'calm', 'glad', 'joy', 'love', 'hate', 'fear', 'hope', 'pride', 'shame', 'guilt', 'regret', 'worry', 'stress', 'anxiety', 'peace', 'comfort', 'wonder', 'surprise', 'delight', 'pleasure', 'fun', 'laugh', 'smile', 'cry', 'tear', 'mood', 'feeling'],
  // actions
  ['run', 'jump', 'walk', 'dance', 'sing', 'swim', 'hover', 'climb', 'crawl', 'slide', 'spin', 'roll', 'kick', 'throw', 'catch', 'grab', 'pull', 'push', 'lift', 'carry', 'drop', 'toss', 'fold', 'bend', 'stretch', 'twist', 'shake', 'flap', 'nod', 'wink', 'clap', 'bounce'],
  // size
  ['big', 'small', 'tall', 'short', 'long', 'wide', 'narrow', 'thin', 'thick', 'fat', 'slim', 'huge', 'giant', 'tiny', 'mini', 'gigantic', 'compact', 'slender', 'plump', 'chunky', 'lean', 'broad', 'deep', 'shallow', 'high', 'low', 'flat', 'round', 'angular', 'curvy', 'spare', 'stout'],
  // qualities
  ['good', 'bad', 'nice', 'kind', 'gentle', 'rough', 'soft', 'hard', 'sharp', 'dull', 'bright', 'dark', 'light', 'heavy', 'fast', 'slow', 'quick', 'rapid', 'swift', 'steady', 'smooth', 'clean', 'dirty', 'fresh', 'old', 'young', 'sweet', 'sour', 'bitter', 'salty', 'spicy', 'hot'],
  // numbers
  ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'million', 'billion', 'trillion'],
  // people
  ['person', 'man', 'woman', 'child', 'baby', 'kid', 'teen', 'adult', 'friend', 'family', 'parent', 'father', 'mother', 'brother', 'sister', 'uncle', 'aunt', 'cousin', 'grandfather', 'grandmother', 'grandpa', 'grandma', 'neighbor', 'doctor', 'nurse', 'coach', 'chef', 'pilot', 'captain', 'hero', 'wizard', 'knight'],
  // clothes
  ['shirt', 'pants', 'dress', 'skirt', 'coat', 'jacket', 'hoodie', 'sweater', 'scarf', 'glove', 'hat', 'cap', 'helmet', 'boot', 'shoe', 'sock', 'sandal', 'sneaker', 'slipper', 'belt', 'tie', 'collar', 'button', 'zipper', 'pocket', 'sleeve', 'uniform', 'costume', 'apron', 'swimsuit', 'pajama', 'wig'],
  // tools
  ['tool', 'hammer', 'nail', 'screw', 'screwdriver', 'wrench', 'pliers', 'saw', 'drill', 'chisel', 'axe', 'mallet', 'awl', 'clamp', 'vise', 'tape', 'level', 'gauge', 'file', 'rasp', 'sander', 'grinder', 'lathe', 'bender', 'torch', 'solder', 'bucket', 'trowel', 'shovel', 'spade', 'rake', 'hoe'],
  // technology
  ['computer', 'screen', 'cursor', 'keyboard', 'monitor', 'laptop', 'phone', 'tablet', 'camera', 'printer', 'scanner', 'speaker', 'headphone', 'microphone', 'battery', 'charger', 'cable', 'plug', 'socket', 'switch', 'toggle', 'pixel', 'byte', 'data', 'server', 'router', 'modem', 'signal', 'wifi', 'chip', 'robot', 'laser'],
  // toys and fun
  ['toy', 'doll', 'teddy', 'puppet', 'puzzle', 'kite', 'yoyo', 'seesaw', 'trampoline', 'marble', 'top', 'frisbee', 'pinwheel', 'jack', 'hoop', 'dodge', 'tag', 'hide', 'seek', 'fort', 'treasure', 'gem', 'jewel', 'crown', 'mask', 'clown', 'jester', 'foam', 'bubble', 'confetti', 'party', 'carnival'],
];

export const WORDS = GROUPS.flat();

/* Invariant: code generation and the self-test below rely on exactly 1024
   unique words. 1024 = 2^10, so (randomUint32 % 1024) is perfectly uniform. */
if (WORDS.length !== 1024 || new Set(WORDS).size !== 1024) {
  throw new Error('wordlist must contain exactly 1024 unique words, got ' + WORDS.length);
}
