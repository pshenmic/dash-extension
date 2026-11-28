export interface SetAppConnectAddressesPayload {
  id: string
  // The full grant, not an addition: an address left out loses access.
  addresses: string[]
}
