import React, { useState, useEffect } from 'react';
import { agentSDK } from "@/agents";
import { getDailyAgentName } from "@/api/eveClient";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import ChatWindow from "./ChatWindow";
import { useLanguage } from '@/components/common/LanguageProvider';

export default function ChatbotWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [conversation, setConversation] = useState(null);
    const [agentName, setAgentName] = useState('Assistant');
    const { t } = useLanguage();

    useEffect(() => {
        // Get today's agent name
        const loadAgentName = async () => {
            try {
                const response = await getDailyAgentName();
                if (response.data.success) {
                    setAgentName(response.data.name);
                }
            } catch (error) {
                console.error('Error loading agent name:', error);
            }
        };

        loadAgentName();
    }, []);

    useEffect(() => {
        // Create conversation when opening chat
        if (isOpen && !conversation) {
            const createConversation = async () => {
                try {
                    const newConversation = await agentSDK.createConversation({
                        agent_name: "platformGuideAgent",
                        metadata: {
                            name: `Chat with ${agentName}`,
                            description: "Customer support conversation"
                        }
                    });
                    setConversation(newConversation);
                } catch (error) {
                    console.error('Error creating conversation:', error);
                }
            };

            createConversation();
        }
    }, [isOpen, conversation, agentName]);

    useEffect(() => {
        // Subscribe to conversation updates
        if (conversation?.id) {
            const unsubscribe = agentSDK.subscribeToConversation(conversation.id, (data) => {
                setConversation(prev => ({
                    ...prev,
                    messages: data.messages
                }));
            });

            return () => {
                unsubscribe();
            };
        }
    }, [conversation?.id]);

    const handleSendMessage = async (messageContent) => {
        if (!conversation) return;

        try {
            await agentSDK.addMessage(conversation, {
                role: "user",
                content: messageContent
            });
        } catch (error) {
            console.error('Error sending message:', error);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-40">
            {!isOpen ? (
                <Button
                    onClick={() => setIsOpen(true)}
                    className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-110 p-2"
                >
                    <img 
                        src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a0d6759fb_Screenshot2025-08-23105026.png" 
                        alt="EVE FINANCE Support" 
                        className="w-full h-full object-cover rounded-full"
                    />
                </Button>
            ) : (
                <Button
                    onClick={() => setIsOpen(false)}
                    className="w-16 h-16 rounded-full bg-slate-600 hover:bg-slate-700 shadow-xl transition-all duration-300"
                >
                    <X className="w-8 h-8 text-white" />
                </Button>
            )}
            
            <ChatWindow
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                conversation={conversation}
                onSendMessage={handleSendMessage}
                agentName={agentName}
            />
        </div>
    );
}