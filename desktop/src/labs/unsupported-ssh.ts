// Local labs only. Exclude docker-modem's optional native SSH dependency from
// the Electron bundle; remote Docker transports are rejected by localDocker().
export class Client {
  constructor() {
    throw new Error("Remote Docker over SSH is not supported by local labs.");
  }
}
