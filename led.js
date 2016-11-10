var Cylon = require('cylon');

Cylon.robot({
  connections: [{ name: 'arduino', adaptor: 'firmata', port: 'COM8' }],

  devices: [{ name: 'led', driver: 'led', pin: 13 }],

  work: function(my) {
    every((0.5).second(), my.led.toggle);
  }
}).start();