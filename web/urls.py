from django.urls import path
from views import index, predict, emi

urlpatterns = [
    path('',         index,   name='index'),
    path('predict/', predict, name='predict'),
    path('emi/',     emi,     name='emi'),
]
