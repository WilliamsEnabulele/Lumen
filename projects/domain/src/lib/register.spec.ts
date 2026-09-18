import { EVIDENCE_TO_RISE, observedRegister, requestedPlain } from './register';

describe('register ladder', () => {
  it('does not treat one stray code-switch as an invitation', () => {
    expect(observedRegister('standardEnglish', 1)).toBe('standardEnglish');
  });

  it('opens one step on repeated code-switching', () => {
    expect(observedRegister('standardEnglish', EVIDENCE_TO_RISE)).toBe('lightInterjection');
  });

  it('climbs a step at a time rather than jumping to the top', () => {
    expect(observedRegister('lightInterjection', 9)).toBe('comfortableCodeSwitch');
  });

  it('has a ceiling', () => {
    expect(observedRegister('comfortableCodeSwitch', 99)).toBe('comfortableCodeSwitch');
  });

  it('honours a request for plain English at once and in full', () => {
    expect(requestedPlain()).toBe('standardEnglish');
  });
});
