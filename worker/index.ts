import {createHonoApp} from "./routes/app";
import {handler} from "./queue/handler";

const honoApp = createHonoApp();

const app = {
    ...honoApp,
    queue: handler,
}

export default app;
