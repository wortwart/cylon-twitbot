var Cylon = require('cylon');

Cylon.robot({
  connection: { name: 'loopback', adaptor: 'loopback' },
  device: { name: 'ping', driver: 'ping' },
  commands: ['test'],
  test: function(greeting) {
    return greeting + " world";
  },
  work: function() {
  	var r = this;
    every((3).seconds(), function() {console.log(r.test('hallo'))});
  }
});

Cylon.start();