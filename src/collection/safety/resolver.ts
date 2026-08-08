import { lookup as nodeLookup } from 'node:dns/promises';

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export interface DestinationResolver {
  resolve(hostname: string): Promise<readonly ResolvedAddress[]>;
}

export type AllAddressLookup = (
  hostname: string,
  options: Readonly<{ all: true; order: 'verbatim' }>,
) => Promise<readonly { readonly address: string; readonly family: number }[]>;

export function createNodeResolver(
  lookup: AllAddressLookup = (hostname, options) =>
    nodeLookup(hostname, options),
): DestinationResolver {
  return Object.freeze({
    async resolve(hostname: string): Promise<readonly ResolvedAddress[]> {
      const answers = await lookup(hostname, { all: true, order: 'verbatim' });
      return Object.freeze(
        answers.map((answer) => {
          if (answer.family !== 4 && answer.family !== 6)
            throw new TypeError('Name lookup returned an unsupported family');
          return Object.freeze({
            address: answer.address,
            family: answer.family,
          });
        }),
      );
    },
  });
}
