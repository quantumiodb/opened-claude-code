/**
 * Stub: types/utils.ts — missing from source map extraction.
 */

export type DeepImmutable<T> = T extends (infer R)[]
  ? ReadonlyArray<DeepImmutable<R>>
  : T extends object
    ? { readonly [K in keyof T]: DeepImmutable<T[K]> }
    : T;

export type Permutations<T extends string, U extends string = T> =
  T extends unknown ? T | `${T} ${Permutations<Exclude<U, T>>}` : never;
