
"use client";

import { useEffect, useRef } from "react";

export interface WebSocketEvent {
    type: string;
    task_id?: number | null;
    task?: any;
}

interface UseWebSocketOptions {
    onMessage: (event: WebSocketEvent) => void;
    onReconnect?: () => void;
}

export default function useWebSocket({
    onMessage,
    onReconnect,
}: UseWebSocketOptions) {
    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectAttemptsRef = useRef(0);

    const messageHandlerRef = useRef(onMessage);
    const reconnectHandlerRef = useRef(onReconnect);

    useEffect(() => {
        messageHandlerRef.current = onMessage;
        reconnectHandlerRef.current = onReconnect;
    }, [onMessage, onReconnect]);

    useEffect(() => {
        // Read the token belonging to this browser tab.
        const token = sessionStorage.getItem("access_token");

        if (!token) return;

        let isActive = true;
        let manuallyClosed = false;

        const connect = () => {
            if (!isActive || manuallyClosed) return;

            // Use the configured backend address.
            const apiUrl =
                process.env.NEXT_PUBLIC_API_URL ||
                "http://127.0.0.1:8000";

            // Convert HTTP/HTTPS into WS/WSS.
            const wsUrl = process.env.NEXT_PUBLIC_WS_URL
                ? process.env.NEXT_PUBLIC_WS_URL.replace(/\/+$/, "")
                : `${apiUrl.replace(/\/+$/, "").replace(/^http/, "ws")}/ws`;

            const socket = new WebSocket(
                `${wsUrl}?token=${encodeURIComponent(token)}`
            );

            socketRef.current = socket;

            socket.onopen = () => {
                if (!isActive) {
                    socket.close();
                    return;
                }

                const wasReconnect =
                    reconnectAttemptsRef.current > 0;

                reconnectAttemptsRef.current = 0;

                if (wasReconnect) {
                    reconnectHandlerRef.current?.();
                }
            };

            socket.onmessage = (message) => {
                try {
                    const event: WebSocketEvent = JSON.parse(message.data);
                    messageHandlerRef.current(event);
                } catch (error) {
                    console.error("Invalid WebSocket message:", error);
                }
            };

            socket.onclose = () => {
                if (!isActive || manuallyClosed) return;

                reconnectAttemptsRef.current += 1;

                const delay = Math.min(
                    1000 * Math.pow(
                        2,
                        reconnectAttemptsRef.current - 1
                    ),
                    30000
                );

                reconnectTimerRef.current = setTimeout(
                    connect,
                    delay
                );
            };

            socket.onerror = () => {
                socket.close();
            };
        };

        connect();

        return () => {
            isActive = false;
            manuallyClosed = true;

            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
            }

            socketRef.current?.close();
            socketRef.current = null;
        };
    }, []);

    return socketRef;
}
