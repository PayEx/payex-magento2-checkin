<?php

namespace PayEx\Checkin\Block\Widget;

use Magento\Customer\Model\ResourceModel\AddressRepository;
use Magento\Customer\Model\ResourceModel\CustomerRepository;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\Event\Manager as EventManager;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\View\Element\Template;
use Magento\Store\Model\ScopeInterface;
use Magento\Widget\Block\BlockInterface;
use PayEx\Api\Service\Consumer\Resource\ConsumerNationalIdentifier;
use PayEx\Api\Service\Consumer\Resource\Request\InitiateConsumerSession as ConsumerSessionResource;
use PayEx\Api\Service\Data\RequestInterface;
use PayEx\Api\Service\Data\ResponseInterface;
use PayEx\Api\Service\Resource\Data\ResponseInterface as ResponseResourceInterface;
use PayEx\Checkin\Helper\Config;
use PayEx\Checkin\Model\ConsumerSession as PayExConsumerSession;
use PayEx\Client\Exception\ServiceException;
use PayEx\Client\Model\Service;
use PayEx\Core\Logger\Logger;

class CheckinWidget extends Template implements BlockInterface
{
    protected $_template = 'PayEx_Checkin::widget/checkin-widget.phtml';

    /**
     * @var PayExConsumerSession $consumerSession
     */
    protected $consumerSession;

    /**
     * @var CustomerSession|object $customerSession
     */
    protected $customerSession;

    /**
     * @var CustomerRepository $customerRepository
     */
    protected $customerRepository;

    /**
     * @var AddressRepository $addressRepository
     */
    protected $addressRepository;

    /**
     * @var EventManager $eventManager
     */
    protected $eventManager;

    /**
     * @var Logger $logger
     */
    protected $logger;

    /**
     * @var Service $service
     */
    protected $service;

    /**
     * @var Config $config
     */
    protected $config;

    public function __construct(
        Template\Context $context,
        PayExConsumerSession $consumerSession,
        CustomerSession $customerSession,
        CustomerRepository $customerRepository,
        AddressRepository $addressRepository,
        EventManager $eventManager,
        Service $service,
        Logger $logger,
        Config $config,
        array $data = []
    ) {
        $this->consumerSession = $consumerSession;
        $this->customerSession = $customerSession;
        $this->customerRepository = $customerRepository;
        $this->addressRepository = $addressRepository;
        $this->eventManager = $eventManager;
        $this->service = $service;
        $this->logger = $logger;
        $this->config = $config;
        parent::__construct($context, $data);
    }

    public function isActive()
    {
        return $this->config->isActive();
    }

    public function isConsumerIdentified()
    {
        return $this->consumerSession->isIdentified();
    }

    /**
     * Get default country
     *
     * @return string
     */
    public function getDefaultCountry()
    {
        $configPath = 'general/country/default';
        $scope = ScopeInterface::SCOPE_STORE;
        return $this->_scopeConfig->getValue($configPath, $scope);
    }

    /**
     * @param ConsumerSessionResource $consumerSessionData
     * @return ResponseInterface|false
     * @throws \PayEx\Client\Exception\ServiceException
     */
    public function initiateConsumerSession(ConsumerSessionResource $consumerSessionData)
    {
        /** @var RequestInterface $consumerSession */
        $consumerSession = $this->service->init('Consumer', 'InitiateConsumerSession', $consumerSessionData);

        /** @var ResponseInterface $response */
        $response = $consumerSession->send();

        if (!($response instanceof ResponseInterface) || !($response->getResponseResource() instanceof ResponseResourceInterface)) {
            $this->logger->error(sprintf('Invalid InitiateConsumerSession response: %s', print_r($response, true)));
            return false;
        }

        $this->consumerSession->isInitiated(true);

        return $response;
    }

    /**
     * @return string|false
     */
    public function getCheckinScript()
    {
        if ($this->consumerSession->getViewOperation()) {
            $viewOperation = $this->consumerSession->getViewOperation();
            return $viewOperation['href'];
        }

        $consumerSessionData = new ConsumerSessionResource();
        $consumerSessionData->setConsumerCountryCode($this->getDefaultCountry());

        if ($this->customerSession->isLoggedIn()) {
            $customerId = $this->customerSession->getCustomerId();
            $customer = $this->customerRepository->getById($customerId);
            $email = $customer->getEmail();
            try {
                $billingAddress = $this->addressRepository->getById($customer->getDefaultBilling());
            } catch (LocalizedException $e) {
                $this->logger->error($e->getMessage());
                return false;
            }
            $msisdn = $billingAddress->getTelephone();
            $countryCode = $billingAddress->getCountryId();
            $this->eventManager->dispatch('payex_checkin_before_initiate_consumer_session');

            $nationalIdentifierData = new ConsumerNationalIdentifier();
            $nationalIdentifierData->setCountryCode($countryCode);

            $consumerSessionData->setMsisdn($msisdn)
                ->setEmail($email)
                ->setConsumerCountryCode($countryCode)
                ->setNationalIdentifier($nationalIdentifierData);
        }

        /** @var ResponseInterface|false $response */
        try {
            $response = $this->initiateConsumerSession($consumerSessionData);
        } catch (ServiceException $e) {
            $this->logger->error($e->getMessage());
            return false;
        }

        if ($response instanceof ResponseInterface) {
            $viewOperation = $response->getOperationByRel('view-consumer-identification');
            $this->consumerSession->setViewOperation($viewOperation);
            return $viewOperation['href'];
        }

        return false;
    }

    protected function _toHtml()
    {
        if (!$this->isActive()) {
            return '';
        }

        return parent::_toHtml();
    }
}
