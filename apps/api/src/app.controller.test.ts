import { AppController } from './app.controller';

describe('AppController', () => {
  it('returns the placeholder health response', () => {
    const controller = new AppController();

    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });
});
