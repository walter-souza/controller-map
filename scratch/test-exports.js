const ni = require('node-interception');
const i = new ni.Interception();
try {
  const keyboards = i.getKeyboards();
  if (keyboards.length > 0) {
    const k = keyboards[0];
    console.log('Sending Space keydown to first keyboard...');
    k.send({
      type: 'keyboard',
      code: 0x39, // Space scancode
      state: ni.KeyState.DOWN,
      information: 0
    });
    setTimeout(() => {
      console.log('Sending Space keyup...');
      k.send({
        type: 'keyboard',
        code: 0x39,
        state: ni.KeyState.UP,
        information: 0
      });
      i.destroy();
    }, 100);
  } else {
    i.destroy();
  }
} catch (err) {
  console.error('Error during send:', err);
  i.destroy();
}
