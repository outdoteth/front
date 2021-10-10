const originalModule = jest.requireActual(
  "renft-front/hooks/store/useSnackProvider"
);
module.exports = {
  __esModule: true,
  ...originalModule,
  useSnackProvider: jest.fn().mockReturnValue({
    setError: jest.fn(),
  }),
};
