"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MessageSquare, Send, Settings, Bot, User, Menu, PlusCircle, LogOut } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { InputTransactionData, useWallet } from "@aptos-labs/wallet-adapter-react"
import "@aptos-labs/wallet-adapter-ant-design/dist/index.css";
import { useAutoConnect } from "@/components/AutoConnectProvider";
import { WalletSelector as ShadcnWalletSelector } from "@/components/WalletSelector";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk"

const models = [
  { id: "qwen2:0.5b", name: "qwen2:0.5b" },
]

const RPC_URL = 'https://testnet.movementnetwork.xyz/v1'
const BOTSOCEAN = '0x199753a8684e2291be0747dfd707392f2ff1f4143ec94868f50dd54912a17fdf'
const BOTSOCEAN_API = 'http://45.77.242.139:4431'
const BOTSOCEAN_PAYMENT_API = 'http://45.77.242.139:4432'

const aptosConfig = new AptosConfig({ fullnode: RPC_URL });
const aptos = new Aptos(aptosConfig);
type Coin = { coin: { value: string } };

export default function ModernWeb3Chat() {
  const { autoConnect, setAutoConnect } = useAutoConnect();
  const { connect, disconnect, connected, wallet, account, network, signAndSubmitTransaction, signMessage, signMessageAndVerify } = useWallet();

  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [jwtToken, setJwtToken] = useState(undefined);
  const [balance, setBalance] = useState(0)
  const [depositValue, setDepositValue] = useState('')
  const [chatId, setChatId] = useState()
  const [messages, setMessages] = useState([
    { id: 1, content: "Hello! How can I assist you today?", sender: "bot" },
  ])
  const [inputMessage, setInputMessage] = useState("")
  const [selectedModel, setSelectedModel] = useState(models[0].name)
  const [isSidebarVisible, setIsSidebarVisible] = useState(true)

  useEffect(() => {
    setAutoConnect(true);
  }, []);

  useEffect(() => {
    const getBalance = async () => {
      if (account?.address) {
        try {
          const accountResource = await aptos.getAccountResource<Coin>({
            accountAddress: account!.address,
            resourceType: "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>",
          });
          console.log(accountResource.coin.value)
          setBalance(Number(accountResource.coin.value) / Math.pow(10, 8));
        } catch (error) {
          console.error('Error fetching balance:', error);
        }
      }
    }

    getBalance();
  }, [account])

  useEffect(() => {
    const getBalance = async () => {
      console.log('Token', jwtToken);
      if (account?.address && !jwtToken) {
        const signPayload = {
          message: "Sign this message to log in", // The message to be signed and displayed to the user
          nonce: "1", // A nonce the dapp should generate
        }
        const signres = await signMessage(signPayload)
        console.log(account.publicKey, account.address, signres.signature);

        const response = await fetch(`${BOTSOCEAN_API}/user/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pubkey: account!.publicKey,
            wallet: account!.address,
            signature: signres.signature.toString(),
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to sign in');
        }

        const data = await response.json();
        setJwtToken(data.token);
        console.log('Token', data.token);
      }
    }

    getBalance();
  }, [account])

  const sendMessage = async () => {
    if (inputMessage.trim()) {
      setMessages([...messages, { id: messages.length + 1, content: inputMessage, sender: "user" }])
      setInputMessage("")

      const newChatData = {
        user_id: '111111',
        chat_id: chatId,
        model: selectedModel,
        prompt: inputMessage
      }

      try {
        const response = await fetch('http://localhost:3001/prompt/ask', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newChatData),
        });

        if (!response.ok) {
          throw new Error('Failed to create new chat');
        }

        const data = await response.json();
        const content = data.response;
        console.log(content);
        const tokenCount = data.token_count;
        const tokenPrice = data.token_price;
        setBalance(balance - tokenCount * tokenPrice);
        setMessages((prevMessages) => [
          ...prevMessages,
          { id: prevMessages.length + 1, content: content, sender: "assistant" },
        ])
      } catch (error) {
        console.error('Error:', error);
      }
    }
  }

  const createNewChat = async () => {
    setMessages([{ id: 1, content: "Hello! How can I assist you today?", sender: "bot" }])

    const newChatData = {
      user_id: '111111', // replace with the actual user ID
      model: selectedModel,      // replace with the actual model type
    };

    try {
      const response = await fetch('http://localhost:3001/prompt/newChat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newChatData),
      });

      if (!response.ok) {
        throw new Error('Failed to create new chat');
      }

      const data = await response.json();
      setChatId(data.chat_id)
      console.log(data); // New chat created successfully
    } catch (error) {
      console.error('Error:', error);
    }
  }

  async function deposit() {
    const depositAmount = Number(depositValue) * (10 ^ 8);
    const transaction: InputTransactionData = {
      data: {
        function: `${BOTSOCEAN}::payment::deposit`,
        functionArguments: [depositAmount]
      }
    }
    try {
      // sign and submit transaction to chain
      const response = await signAndSubmitTransaction(transaction);
      // wait for transaction
      console.log(`Success! View your transaction at https://explorer.movementlabs.xyz/txn/${response.hash}`)
      await aptos.waitForTransaction({ transactionHash: response.hash });
      const postDepositResponse = await fetch(`${BOTSOCEAN_PAYMENT_API}/payment/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ depositTxHash: response.hash }),
      });
    } catch (error: any) {
      console.log("Error:", error)
    }
  }

  async function requestWithdrawal() {
    const transaction: InputTransactionData = {
      data: {
        function: `${BOTSOCEAN}::payment::request_withdrawal`,
        functionArguments: []
      }
    }
    try {
      // sign and submit transaction to chain
      const response = await signAndSubmitTransaction(transaction);
      // wait for transaction
      console.log(`Success! View your transaction at https://explorer.movementlabs.xyz/txn/${response.hash}`)
      await aptos.waitForTransaction({ transactionHash: response.hash });
    } catch (error: any) {
      console.log("Error:", error)
    }
  }

  useEffect(() => {
    const scrollArea = document.querySelector('.scroll-area')
    if (scrollArea) {
      scrollArea.scrollTop = scrollArea.scrollHeight
    }
  }, [messages])

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Chat history sidebar */}
      {isSidebarVisible && (
        <div className="w-64 bg-white border-r border-gray-200 hidden md:flex md:flex-col">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-700">Chat History</h2>
            <Button variant="ghost" size="sm" onClick={() => setIsSidebarVisible(false)}>
              <Menu className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-grow">
            {messages.map((message) => (
              <div key={message.id} className="p-4 hover:bg-gray-50 transition-colors duration-200 cursor-pointer">
                <div className="flex items-center space-x-2">
                  <MessageSquare className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600 truncate">{message.content}</span>
                </div>
              </div>
            ))}
          </ScrollArea>

          <div className="border-t border-gray-200 p-4">
            {connected ? (
              <>
                <div className="bg-gray-50 p-3 rounded-md shadow-sm">
                  <p className="text-sm mb-1">
                    <span className="font-semibold text-gray-600">Balance: {balance}</span>{" "}
                    <span className="font-bold text-gray-800">{ } BOTSO</span>
                  </p>
                  <p className="text-sm">
                    <span className="font-semibold text-gray-600">Model:</span>{" "}
                    <span className="font-bold text-gray-800">{models.find(m => m.id === selectedModel)?.name}</span>
                  </p>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full mb-2">
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Settings</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div>
                        <h1 className="text-m font-semibold mb-2">Model selection</h1>
                        <Select value={selectedModel} onValueChange={setSelectedModel}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a model" />
                          </SelectTrigger>
                          <SelectContent>
                            {models.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <h1 className="text-m font-semibold mb-2">Wallet</h1>
                        <div className="space-y-2">
                          <div className="mb-4">
                            <p className="text-sm font-medium">Balance: {balance} MOVE</p>
                          </div>
                          <div className="flex space-x-2">
                            <Input
                              type="number"
                              placeholder="Enter deposit amount"
                              className="flex-1"
                              value={depositValue}
                              onChange={(e) => {
                                setDepositValue(e.target.value)
                              }}
                            />
                            <Button variant="outline" onClick={() => deposit()} className="flex-1">
                              Deposit
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h1 className="text-m font-semibold mb-2">Botsocean</h1>
                        <div className="space-y-2">
                          <div className="mb-4">
                            <p className="text-sm font-medium">Balance: 1 MOVE</p>
                          </div>
                          <div className="flex space-x-2">
                            <Button variant="outline" onClick={() => requestWithdrawal()} className="flex-1">
                              Request Withdrawal
                            </Button>
                            <div className="flex-1"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button variant="outline" className="w-full mb-2" onClick={disconnect}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </>
            ) : (
              <ShadcnWalletSelector />
              // <WalletSelection />
              // <Button onClick={connectWallet} className="w-full">Connect Wallet</Button>
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {!isSidebarVisible && (
              <Button variant="ghost" size="sm" onClick={() => setIsSidebarVisible(true)}>
                <Menu className="h-4 w-4" />
              </Button>
            )}
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-40 text-black">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={createNewChat}>
            <PlusCircle className="h-4 w-4 mr-2" />
            New Chat
          </Button>
        </header>

        {/* Chat messages */}
        <ScrollArea className="flex-1 p-4 scroll-area">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"} mb-4`}
              >
                <div
                  className={`max-w-sm rounded-lg p-4 ${message.sender === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-white text-gray-800 border border-gray-200"
                    }`}
                >
                  <div className="flex items-center space-x-2 mb-2">
                    {message.sender === "user" ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                    <span className="font-semibold">{message.sender === "user" ? "You" : "AI"}</span>
                  </div>
                  {message.content}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </ScrollArea>

        {/* Message input */}
        <div className="border-t border-gray-200 p-4 bg-white">
          <div className="flex space-x-2">
            <Input
              type="text"
              placeholder="Type your message..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
              className="flex-1"
            />
            <Button onClick={sendMessage}>
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}