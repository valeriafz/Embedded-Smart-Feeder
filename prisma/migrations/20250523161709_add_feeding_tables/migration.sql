-- CreateTable
CREATE TABLE `FeedingSchedule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `catId` INTEGER NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `time` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FeedingSchedule_catId_deviceId_time_key`(`catId`, `deviceId`, `time`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeedingHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `catId` INTEGER NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FeedingHistory_catId_timestamp_idx`(`catId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FeedingSchedule` ADD CONSTRAINT `FeedingSchedule_catId_fkey` FOREIGN KEY (`catId`) REFERENCES `Cat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeedingHistory` ADD CONSTRAINT `FeedingHistory_catId_fkey` FOREIGN KEY (`catId`) REFERENCES `Cat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
