<?php

namespace PayEx\Checkin\Helper;

use PayEx\Core\Helper\Config as CoreConfig;

class Config extends CoreConfig
{
    const XML_CONFIG_GROUP = 'checkin';

    protected $moduleDependencies = [
        'PayEx_Client'
    ];
}
