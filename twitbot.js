var Cylon = require('cylon'),
  EventEmitter = require('events').EventEmitter,
  emitter = new EventEmitter(),
  twitter = require('simple-twitter'),
  morse,
  delayPoll = 300..seconds(), // Zeit zwischen zwei Twitter-Abfragen
  delayMorse = 10..seconds(), // Zeit zwischen zwei Morsenachrichten
  delayTurn = 3..seconds(); // Zeit zwischen zwei Kopfdrehungen

twitter = new twitter(
  '...', //API Key
  '...', // API Secret
  '...', // Access Token
  '...', // Access Token Secret
  false // Caching in Sekunden. Deaktiviert, da sonst der since_id-Parameter nicht zu funktionieren scheint.
);

Cylon.api({ // für Fernsteuerung via Browser
  host: '127.0.0.1',
  port: '1234'
});

Cylon.robot({ // definiert den Roboter
  name: "TwitBot",

  connections: [ // Verbindung zu Arduino
    {name: 'arduino', adaptor: 'firmata', port: 'COM8'}
  ],

  devices: [ // zwei LEDs, ein Servo
    {name: 'ledMorse', driver: 'led', pin: 13, connection: 'arduino'},
    {name: 'ledPower', driver: 'led', pin: 12, connection: 'arduino'},
    {name: 'servo', driver: 'servo', pin: 3}
  ],

  commands: ["hello", "turnhead", "turnoff", "turnon"], // API-Befehle

  work: function() { // Roboter-Setup
    emitter.on('tweetsFetched', (function() { // Tweets wurden geholt
      this.outputTweet();
    }).bind(this));
    emitter.on('tweetQueueEmpty', function() { // TwitBot hat keine Tweets mehr zu senden
      console.info('Robo hat alle Tweets gemorst.');
    });
    process.on('exit', (function() { // Shutdown-Events
      this.turnoff();
      console.info('Robo schläft.');
    }).bind(this));
    process.on('SIGINT', function() {
      process.exit();
    });

    this.ledPower.turnOn(); // Power-Lämpchen an
    this.getTweets(); // holt Tweets
    console.info('Robo ist wach.');
  },

  tweets: [], // Queue mit zu morsenden Tweets
  lastTweet: 0, // ID des neuesten Tweets

  getTweets: function() { // holt Tweets
    var since = this.lastTweet? '?since_id=' + this.lastTweet : null; // Einschränkung: nur neue Tweets
    twitter.get('statuses/mentions_timeline', since, (function(error, data) { // holt die letzten 20 Mentions
      if (error && error.data != undefined) { // Fehler
        console.warn('Robo hat ein ' + error.statusCode + '-Problem.');
        console.warn(error.data);
      } else if (data) { // Daten als JSON
        var newTweets = JSON.parse(data);
        if (newTweets.length) { // es gibt neue Tweets
          console.info('Robo hat ' + newTweets.length + ' neue Tweets eingelesen, zuletzt ' + this.lastTweet);
          this.lastTweet = newTweets[0].id; // ID des neuesten Tweets
          this.tweets = newTweets.concat(this.tweets); // vereint alte und neue Tweets in einem Array
          emitter.emit('tweetsFetched'); // feuert Event
        } else { // Daten-Array ist leer
          console.info('Robo hat heute keine Tweets für dich.');
        }
      } else { // Es kamen weder Daten noch Fehler zurück
        console.warn('Robo hat beim Holen der Tweets einen komischen Fehler gemacht.');
      }
      after(delayPoll, (function() {
        console.info('Robo sucht neue Tweets ...');
        this.getTweets();
      }).bind(this));
    }).bind(this));
  },

  outputLoop: false, // läuft gerade this.outputTweet()?

  outputTweet: function() { // bereitet Tweets für die Ausgabe vor
    if (this.outputLoop == true) return; // Funktion darf nur einmal laufen
    this.outputLoop = true;
    if (!this.tweets.length) { // Queue ist leer: Abbruch
      emitter.emit('tweetQueueEmpty');
      this.outputLoop = false;
      return true;
    }
    if (this.ledMorse.morsing) { // Morse-Funktion läuft gerade
      console.info('Robo morst noch und versucht es wieder in ' + delayMorse / 1000 + ' Sekunden.');
      after(delayMorse, (function() {
        this.outputLoop = false;
        this.outputTweet();
      }).bind(this));
      return;
    }
    // Es gibt Tweets und kein anderer Ausgabevorgang läuft:
    var tweet = this.tweets.pop(); // ältester Tweet im Array
    morse.morse(tweet.text, this.ledMorse);
    this.turn(tweet.user.followers_count, this.servo);
    emitter.once('morseReady', (function(ev) { // nächster Tweet nach morseReady-Event und Pause
      if (this.tweets.length) console.info('Robo morst in ' + delayMorse / 1000 + ' Sekunden den nächsten von ' + this.tweets.length + ' verbleibenden Tweets.');
      after(delayMorse, (function() {
        this.outputLoop = false;
        this.outputTweet();
      }).bind(this));
    }).bind(this));
  },

  turn: function(count, servo) { // dreht den Kopf des Roboters
    var _count = count;
    count /= 1000; // rechne Followerzahl auf Skala zwischen 0 und 90 um
    if (count > 1) count = 1;
    var angle = count.toScale(0, 90);
    console.info(_count + ' Follower verdrehen Robos Kopf um ' + angle + ' Grad.');
    servo.angle(90 + angle); // Drehung nach rechts
    after(delayTurn, function() {
      servo.angle(90 - angle); // Drehung nach links
      after(delayTurn, function() {
        servo.angle(90); // Drehung in die Mitte
      });
    });
  },

  hello: function(greeting, led) { // API-Funktion: morst eine Nachricht
    if (!greeting) greeting = 'Ja, hallo?';
    if (!led) led = this.ledMorse;
    if (led.morsing) {
      console.info('Robo möchte hallo sagen, ist aber noch nicht fertig mit dem Morsen. Er versucht es wieder in ' + delayMorse / 1000 + ' Sekunden.');
      after(delayMorse, (function() {
        this.hello(greeting);
      }).bind(this));
    } else {
      morse.morse(greeting, this.ledMorse);
    }
  },

  turnhead: function(angle) { // API-Funktion: dreht den Kopf
    if (angle === undefined) return;
    angle = parseFloat(angle);
    if (isNaN(angle)) return;
    if (angle < 0) angle = 0;
    if (angle > 180) angle = 180;
    console.info('Robo dreht den Kopf auf ' + angle + ' Grad.');
    this.servo.angle(angle);
  },

  turnoff: function() { // API-Funktion: Ruhezustand
    console.info('ausschalten ...');
    this.ledPower.turnOff();
    this.ledMorse.turnOff();
    this.servo.angle(90);
    this.tweets = [];
    this.lastTweet = 0;
    this.outputLoop = true;
    after(delayMorse, (function() { // outputTweet-Schleife abwarten
      this.outputLoop = false;
      console.info('Robo schläft wieder.');
    }).bind(this));
  },

  turnon: function() { // API-Funktion: Ruhezustand beenden
    console.info('neu einschalten ...');
    this.ledPower.turnOff();
    this.outputLoop = true;
    after(delayMorse, (function() { // outputTweet-Schleife abwarten
      this.outputLoop = false;
      this.ledPower.turnOn();
      this.servo.angle(90);
      this.getTweets();
      console.info('Robo ist wieder wach.');
    }).bind(this));
  }
});

morse = {
  code: { // Liste der Morsezeichen
    "A": ".-",
    "B": "-...",
    "C": "-.-.",
    "D": "-..",
    "E": ".",
    "F": "..-.",
    "G": "--.",
    "H": "....",
    "I": "..",
    "J": ".---",
    "K": "-.-",
    "L": ".-..",
    "M": "--",
    "N": "-.",
    "O": "---",
    "P": ".--.",
    "Q": "--.-",
    "R": ".-.",
    "S": "...",
    "T": "-",
    "U": "..-",
    "V": "...-",
    "W": ".--",
    "X": "-..-",
    "Y": "-.--",
    "Z": "--..",
    "0": "-----",
    "1": ".----",
    "2": "..---",
    "3": "...--",
    "4": "....-",
    "5": ".....",
    "6": "-....",
    "7": "--...",
    "8": "---..",
    "9": "----.",
    "À": ".--.-",
    "Å": ".--.-",
    "Ä": ".-.-",
    "È": ".-..-",
    "É": "..-..",
    "Ö": "---.",
    "Ü": "..--",
    "ß": "...--..",
    "Ñ": "--.--",
    ".": ".-.-.-",
    ",": "--..--",
    ":": "---...",
    ";": "-.-.-.",
    "?": "..--..",
    "-": "-....-",
    "_": "..--.-",
    "(": "-.--.",
    ")": "-.--.-",
    "=": "-...-",
    "+": ".-.-.",
    "/": "-..-.",
    "@": ".--.-."
  },

  get dit() { // Länge des kurzen Zeichens ("Dit") in Millisekunden
    return 90;
  },

  morse: function(message, led) { // erwartet Nachricht und Morse-LED
    if (!message || !led) return;
    if (led.morsing) { // Abbruch, wenn LED belegt ist
      console.warning('Robo kann nicht zwei Nachrichten gleichzeitig morsen. Die nicht gemorste Nachricht lautet: ' + message);
      return false;
    }
    led.morsing = true;
    led.turnOff();
    console.info('Robo morst: "' + message + '" ...');
    var letters = message.split(''); // trennt Nachricht in Buchstaben auf
    emitter.once('morseReady', (function(ev) { // löst aus, wenn Nachricht fertig gemorst ist
      led.morsing = false;
      console.info('Robo hat eine Nachricht gemorst.');
    }).bind(this));
    this._letter(letters, led);
  },

  _letter: function(letters, led) { // morst einen Buchstaben
    if (!led.morsing) letters = [];
    if (!letters.length) {
      emitter.emit('morseReady'); // feuert einen Event und bricht ab, wenn das Buchstaben-Array leer ist
      return true;
    }
    var signal = this.code[letters.shift().toUpperCase()]; // sucht den Morsecode zum 1. Buchstaben des Arrays heraus
    if (!signal) { // wenn es keinen Morsecode gibt, behandle es wie ein Leerzeichen
      led.turnOff();
      after(4 * this.dit, (function() {
        this._letter(letters, led);
      }).bind(this));
    } else {
      this._sign(signal.split(''), letters, led); // schick ein Array mit Dits und Dahs an _sign
    }
  },

  _sign: function(signs, letters, led) { // morst ein Dit oder Dah
    if (!led.morsing) signs = [];
    if (!signs.length) { // wenn das Dit/Dah-Array aufgebraucht ist, mach eine Pause und gib zurück an _letter
      led.turnOff();
      after(3 * this.dit, (function() {
        this._letter(letters, led);
      }).bind(this));
    } else {
      var duration = (signs.shift() == '-')? 3 * this.dit : this.dit; // Dahs sind dreimal so lang wit Dits
      led.turnOn();
      after(duration, (function() {
        led.turnOff(); // schalte das LED wieder ab
        after(this.dit, (function() {
          this._sign(signs, letters, led); // morse das nächste Dit/Dah nach kurzer Pause
        }).bind(this));
      }).bind(this));
    }
  }
};

Cylon.start(); // startet den Roboter
