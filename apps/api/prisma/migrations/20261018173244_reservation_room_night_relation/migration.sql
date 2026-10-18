-- AddForeignKey
ALTER TABLE "reservation_room_nights" ADD CONSTRAINT "reservation_room_nights_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
