CREATE TABLE `login_rate_limits` (
	`rateKey` varchar(64) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`windowStart` timestamp NOT NULL DEFAULT (now()),
	`blockedUntil` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `login_rate_limits_rateKey` PRIMARY KEY(`rateKey`)
);
