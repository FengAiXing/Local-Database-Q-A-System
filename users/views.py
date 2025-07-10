from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.contrib.auth.models import User
from .models import UserSettings
from .serializers import UserSettingsSerializer
from .serializers import RegisterSerializer, ChangePasswordSerializer,UserProfileSerializer

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (AllowAny,)
    serializer_class = RegisterSerializer

class ChangePasswordView(generics.UpdateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = ChangePasswordSerializer
    
    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # 检查旧密码是否正确
        user = request.user
        if not user.check_password(serializer.validated_data['old_password']):
            return Response({"old_password": ["旧密码不正确"]}, status=status.HTTP_400_BAD_REQUEST)
        
        # 设置新密码
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        
        return Response({"detail": "密码已成功修改"}, status=status.HTTP_200_OK)

class UserProfileView(generics.RetrieveAPIView):
    permission_classes = (IsAuthenticated,)
    
    def get(self, request, *args, **kwargs):
        user = request.user
        return Response({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "date_joined": user.date_joined
        })
        
class UserProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = UserProfileSerializer
    
    def get_object(self):
        return self.request.user
    
    def get(self, request, *args, **kwargs):
        user = request.user
        return Response({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "date_joined": user.date_joined
        })
        
class UserSettingsView(APIView):
    """用户设置视图"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """获取用户设置"""
        try:
            settings, created = UserSettings.objects.get_or_create(user=request.user)
            serializer = UserSettingsSerializer(settings)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def post(self, request):
        """更新用户设置"""
        try:
            settings, created = UserSettings.objects.get_or_create(user=request.user)
            serializer = UserSettingsSerializer(settings, data=request.data, partial=True)
            
            if serializer.is_valid():
                serializer.save()
                return Response({'message': '设置已保存', 'data': serializer.data})
            else:
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)