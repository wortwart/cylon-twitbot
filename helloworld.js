var Cylon = require('cylon');

Cylon.robot({
  connections: [{name: 'loopback', adaptor: 'loopback'}],
  devices: [{name: 'ping', driver: 'ping'}],
  commands: function() {
    return {test: this.test};
  },
  test: function(greeting) {
    return greeting + " world";
  },
  work: function(cy) {
    every((3).seconds(), function() {console.log(cy.test('hello'))});
  }
});

Cylon.start();