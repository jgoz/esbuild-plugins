declare module 'io-spin' {
  declare type SpinnerType =
    | 'Box1'
    | 'Box2'
    | 'Box3'
    | 'Box4'
    | 'Box5'
    | 'Box6'
    | 'Box7'
    | 'Spin1'
    | 'Spin2'
    | 'Spin3'
    | 'Spin4'
    | 'Spin5'
    | 'Spin6'
    | 'Spin7'
    | 'Spin8'
    | 'Spin9'
    | 'Dot1'
    | 'Dot2';

  export interface Spinner {
    start(): this;
    stop(): this;
    update(placeholder: string): this;
  }
  export default function spin(text: string, type?: SpinnerType): Spinner;
}
