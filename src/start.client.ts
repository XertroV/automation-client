#!/usr/bin/env node

import { automationClient } from "./automationClient";
import { loadConfiguration } from "./configuration";
import { logger } from "./index";
import { enableDefaultScanning } from "./scan";

loadConfiguration()
    .then(configuration => {
        enableDefaultScanning(configuration);
        return configuration;
    })
    .then(configuration => automationClient(configuration).run());
