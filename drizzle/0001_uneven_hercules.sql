CREATE TABLE `activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`action` varchar(255) NOT NULL,
	`targetType` varchar(100),
	`targetId` int,
	`details` json,
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_interactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sessionId` varchar(100),
	`inputText` text,
	`outputText` text,
	`model` varchar(100),
	`tokensUsed` int,
	`latencyMs` int,
	`wasSuccessful` boolean NOT NULL DEFAULT true,
	`errorMessage` text,
	`category` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_interactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `disease_detections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cropType` varchar(100),
	`diseaseName` varchar(255),
	`confidence` float,
	`severity` enum('low','medium','high','critical'),
	`imageUrl` text,
	`aiResponse` text,
	`status` enum('pending','reviewed','resolved') NOT NULL DEFAULT 'pending',
	`reviewedBy` int,
	`reviewNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `disease_detections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `farmer_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`farmName` varchar(255),
	`location` varchar(255),
	`farmSizeHectares` float,
	`primaryCrop` varchar(100),
	`isVerified` boolean NOT NULL DEFAULT false,
	`verificationStatus` enum('pending','approved','rejected') DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `farmer_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`isEnabled` boolean NOT NULL DEFAULT false,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `feature_flags_id` PRIMARY KEY(`id`),
	CONSTRAINT `feature_flags_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `forum_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(500),
	`content` text NOT NULL,
	`category` varchar(100),
	`isRemoved` boolean NOT NULL DEFAULT false,
	`removedReason` text,
	`removedBy` int,
	`likeCount` int DEFAULT 0,
	`commentCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `forum_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marketplace_listings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`price` float,
	`unit` varchar(50),
	`category` varchar(100),
	`status` enum('active','sold','removed','pending') DEFAULT 'active',
	`isRemoved` boolean NOT NULL DEFAULT false,
	`removedReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketplace_listings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`subject` varchar(500) NOT NULL,
	`description` text NOT NULL,
	`category` varchar(100),
	`status` enum('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`assignedTo` int,
	`resolvedAt` timestamp,
	`adminNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporterId` int NOT NULL,
	`targetUserId` int,
	`targetPostId` int,
	`targetListingId` int,
	`reason` varchar(255) NOT NULL,
	`description` text,
	`status` enum('pending','resolved','dismissed') NOT NULL DEFAULT 'pending',
	`resolvedBy` int,
	`resolvedAt` timestamp,
	`resolution` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_reports_id` PRIMARY KEY(`id`)
);
